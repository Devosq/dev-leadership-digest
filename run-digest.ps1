# Dev Leadership Digest — nightly runner (workstation Task Scheduler).
# Brings up the VPS2 Ollama SSH tunnel (127.0.0.1:11435 -> VPS2:11434) if it is
# not already listening, then runs the digest. All output -> logs/digest-<date>.log.
# Safe to run by hand any time: `pwsh -File run-digest.ps1`.

$ErrorActionPreference = 'Continue'
$proj = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $proj
New-Item -ItemType Directory -Force -Path "$proj\logs" | Out-Null
$log = Join-Path $proj ("logs\digest-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

function Test-Port($p) {
  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); return $true }
  catch { return $false }
}

# Ensure the Ollama tunnel is up (best-effort). Adjust the SSH target if your
# VPS2 host/user/key differ. The digest aborts cleanly if Ollama is unreachable,
# so a failed tunnel never produces a misleading "all clear" note.
if (-not (Test-Port 11435)) {
  "[{0}] starting VPS2 Ollama tunnel" -f (Get-Date -Format o) | Tee-Object -FilePath $log -Append | Out-Null
  Start-Process ssh -ArgumentList '-fN', '-o', 'ServerAliveInterval=30', '-L', '11435:127.0.0.1:11434', 'root@<VPS2_IP>' -WindowStyle Hidden
  Start-Sleep -Seconds 5
}

"[{0}] running digest" -f (Get-Date -Format o) | Tee-Object -FilePath $log -Append | Out-Null
& npx tsx src/index.ts *>> $log
"[{0}] exit code {1}" -f (Get-Date -Format o), $LASTEXITCODE | Tee-Object -FilePath $log -Append | Out-Null
