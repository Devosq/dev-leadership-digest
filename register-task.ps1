# Registers the nightly Dev Leadership Digest as a Windows Scheduled Task at 05:00.
# Registered DISABLED on purpose — enable it only after you have (1) filled .env
# (Telegram token + chat id), and (2) verified ONE live run by hand:
#     pwsh -File run-digest.ps1      # tunnel up, real qwen output to Obsidian
# Then:  Enable-ScheduledTask -TaskName 'DevLeadershipDigest'
# Remove with:  Unregister-ScheduledTask -TaskName 'DevLeadershipDigest' -Confirm:$false

$proj = Split-Path -Parent $MyInvocation.MyCommand.Path
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$proj\run-digest.ps1`""
$trigger = New-ScheduledTaskTrigger -Daily -At 5:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName 'DevLeadershipDigest' `
  -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Nightly read-only multi-role code digest -> Telegram + Obsidian (local qwen, EU-safe)' `
  -Force | Out-Null

Disable-ScheduledTask -TaskName 'DevLeadershipDigest' | Out-Null
Write-Host "Registered 'DevLeadershipDigest' (DISABLED). Verify one live run, then: Enable-ScheduledTask -TaskName 'DevLeadershipDigest'"
