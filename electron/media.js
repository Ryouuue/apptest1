// What is playing on this PC, from any app (Spotify, a browser tab, a media player), with no account: Windows' media
// session list (System Media Transport Controls). A hidden PowerShell reads it through WinRT, so no native module is needed.
// It prints one JSON line when the song or its state changes, and takes toggle/next/prev on stdin.
const { spawn } = require('child_process');

const PS = String.raw`
$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$ms = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asT = ($ms | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1' })[0]
$asP = ($ms | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperationWithProgress${'`'}2' })[0]
function Await($op, [Type]$t) { $k = $asT.MakeGenericMethod($t).Invoke($null, @($op)); [void]$k.Wait(4000); $k.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.Buffer, Windows.Storage.Streams, ContentType = WindowsRuntime]
$MP = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
function Art($p) {
  try {
    if (-not $p.Thumbnail) { return '' }
    $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $n = [uint32]([Windows.Storage.Streams.IRandomAccessStream].GetProperty('Size').GetValue($st))
    if ($n -lt 1 -or $n -gt 3000000) { return '' }
    $buf = [Windows.Storage.Streams.Buffer]::new($n)
    $op = [Windows.Storage.Streams.IInputStream].GetMethod('ReadAsync').Invoke($st, @($buf, $n, [Windows.Storage.Streams.InputStreamOptions]::None))
    $k = $asP.MakeGenericMethod([Windows.Storage.Streams.IBuffer], [uint32]).Invoke($null, @($op)); [void]$k.Wait(4000)
    $b = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::ToArray($k.Result)
    $mime = if ($b[0] -eq 0x89) { 'image/png' } else { 'image/jpeg' }
    return "data:$mime;base64," + [Convert]::ToBase64String($b)
  } catch { return '' }
}
$in = New-Object IO.StreamReader([Console]::OpenStandardInput()); $read = $in.ReadLineAsync(); $last = ''; $lastKey = ''; $art = ''
while ($true) {
  if ($read.IsCompleted) {
    $c = $read.Result
    if ($null -eq $c) { break }
    try {
      $s = $mgr.GetCurrentSession()
      if ($s) {
        switch ($c.Trim()) { 'toggle' { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) } 'next' { [void](Await ($s.TrySkipNextAsync()) ([bool])) } 'prev' { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) } }
      }
    } catch {}
    $read = $in.ReadLineAsync()
  }
  try {
    $s = $mgr.GetCurrentSession(); $o = @{ on = $false }
    if ($s) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) $MP; $pi = $s.GetPlaybackInfo(); $cl = $pi.Controls
      $key = "$($s.SourceAppUserModelId)|$($p.Title)|$($p.Artist)"
      if ($key -ne $lastKey) { $lastKey = $key; $art = Art $p }
      $o = @{ on = [bool]$p.Title; app = "$($s.SourceAppUserModelId)"; title = "$($p.Title)"; artist = "$($p.Artist)"; album = "$($p.AlbumTitle)"; playing = ("$($pi.PlaybackStatus)" -eq 'Playing'); next = [bool]$cl.IsNextEnabled; prev = [bool]$cl.IsPreviousEnabled; art = $art }
    }
    $j = $o | ConvertTo-Json -Compress
    if ($j -ne $last) { $last = $j; [Console]::Out.WriteLine($j); [Console]::Out.Flush() }
  } catch {}
  Start-Sleep -Milliseconds 900
}
`;

// send(state) gets every change. cmd(name) drives the playing app; both do nothing off Windows.
function startMedia(send) {
  if (process.platform !== 'win32') return { cmd() {}, stop() {} };
  let ps = null, fails = 0, stopped = false;
  const run = () => {
    const enc = Buffer.from(PS, 'utf16le').toString('base64');
    ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '';
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith('{')) { try { send(JSON.parse(line)); fails = 0; } catch { /* a torn line */ } } }
    });
    ps.stdin.on('error', () => {});
    ps.on('error', () => {});
    ps.on('exit', () => { ps = null; if (!stopped && ++fails < 4) setTimeout(run, 3000 * fails); }); // a crash restarts; a system without the API gives up quietly
  };
  run();
  return { cmd: c => { if (ps && ['toggle', 'next', 'prev'].includes(c)) ps.stdin.write(c + '\n'); }, stop: () => { stopped = true; ps?.kill(); } };
}
module.exports = { startMedia };
