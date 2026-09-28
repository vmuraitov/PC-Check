// Fixed, read-only PowerShell script. No renderer values or file paths are interpolated.
export const UNTURNED_LAUNCH_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$ProgressPreference = 'SilentlyContinue'
$warnings = New-Object 'System.Collections.Generic.List[string]'
$live = New-Object 'System.Collections.Generic.List[object]'
$unknownLivePids = New-Object 'System.Collections.Generic.List[long]'
$history = New-Object 'System.Collections.Generic.List[object]'
$logStatuses = New-Object 'System.Collections.Generic.List[object]'
$liveAvailable = $false
$checkedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$game = $null
$sources = @(
  @{ Name = 'Security 4688'; Log = 'Security'; Id = 4688 },
  @{ Name = 'Sysmon 1'; Log = 'Microsoft-Windows-Sysmon/Operational'; Id = 1 }
)

function Read-LaunchEvent($eventRecord, $sourceName) {
  try {
    $eventXml = [xml]$eventRecord.ToXml()
    $fields = @{}
    foreach ($field in $eventXml.Event.EventData.Data) {
      $fields[[string]$field.Name] = [string]$field.'#text'
    }
    if ($sourceName -eq 'Security 4688') {
      $imagePath = $fields['NewProcessName']
      $processNumber = [Convert]::ToInt64(($fields['NewProcessId'] -replace '^0x', ''), 16)
      $startTime = ([DateTimeOffset]$eventRecord.TimeCreated).ToUnixTimeMilliseconds()
    } else {
      $imagePath = $fields['Image']
      $processNumber = [long]$fields['ProcessId']
      $utc = [DateTime]::Parse($fields['UtcTime'], [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal)
      $startTime = ([DateTimeOffset]$utc).ToUnixTimeMilliseconds()
    }
    if (!$imagePath) { return $null }
    return @{ name = [IO.Path]::GetFileName($imagePath); path = $imagePath; pid = $processNumber;
      startedAt = $startTime; source = $sourceName }
  } catch { return $null }
}

function Read-LaunchLog($source, $from, $until, $limit) {
  try {
    $log = Get-WinEvent -ListLog $source.Log -ErrorAction Stop
    if (!$log.IsEnabled) {
      return @{ records = @(); status = 'unavailable'; message = 'This event log is disabled.' }
    }
    $queryErrors = @()
    $events = @(Get-WinEvent -FilterHashtable @{
      LogName = $source.Log; Id = $source.Id; StartTime = $from; EndTime = $until
    } -MaxEvents $limit -ErrorAction SilentlyContinue -ErrorVariable queryErrors)
    $failures = @($queryErrors | Where-Object { $_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*' })
    if ($failures.Count -gt 0) {
      return @{ records = @(); status = 'unavailable'; message = 'Cannot read this log. Administrator access may be required.' }
    }
    $records = New-Object 'System.Collections.Generic.List[object]'
    $skipped = 0
    foreach ($eventRecord in $events) {
      $parsed = Read-LaunchEvent $eventRecord $source.Name
      if ($null -ne $parsed) { $records.Add($parsed) } else { $skipped++ }
      $eventRecord.Dispose()
    }
    if ($events.Count -ge $limit -or $skipped -gt 0) {
      return @{ records = @($records.ToArray()); status = 'limited'; message = "Partial results: limit $limit events; unreadable records: $skipped." }
    }
    if ($records.Count -eq 0) {
      return @{ records = @(); status = 'empty'; message = 'No process creation events in this period. Recording may not have been enabled.' }
    }
    return @{ records = @($records.ToArray()); status = 'available'; message = 'Saved process creation events were read. Recording gaps and filters may still omit launches.' }
  } catch {
    return @{ records = @(); status = 'unavailable'; message = 'Log missing or inaccessible. Administrator access may be required.' }
  }
}

try {
  $processes = @(Get-CimInstance Win32_Process -Property Name, ProcessId, ExecutablePath, CreationDate)
  $unknownTimes = 0
  foreach ($process in $processes) {
    if (!$process.CreationDate) { $unknownTimes++; $unknownLivePids.Add([long]$process.ProcessId); continue }
    $live.Add(@{ name = [string]$process.Name; path = [string]$process.ExecutablePath;
      pid = [long]$process.ProcessId; startedAt = ([DateTimeOffset]$process.CreationDate).ToUnixTimeMilliseconds();
      source = 'Running processes' })
  }
  $liveAvailable = $true
  if ($unknownTimes -gt 0) { $warnings.Add("Start times were unavailable for $unknownTimes running processes.") }
} catch { $warnings.Add('The running process list could not be read. Current process status is unknown.') }

# Prefer the newest currently running Unturned game, excluding the BattlEye launcher.
$game = $live | Where-Object { $_.name -ieq 'Unturned.exe' } | Sort-Object startedAt -Descending | Select-Object -First 1
if ($null -eq $game) {
  $until = Get-Date
  $from = $until.AddDays(-7)
  foreach ($source in $sources) {
    $discovery = Read-LaunchLog $source $from $until 10000
    $candidate = $discovery.records | Where-Object { $_.name -ieq 'Unturned.exe' } |
      Sort-Object startedAt -Descending | Select-Object -First 1
    if ($null -ne $candidate -and ($null -eq $game -or $candidate.startedAt -gt $game.startedAt)) { $game = $candidate }
    if ($discovery.status -eq 'limited') { $warnings.Add($source.Name + ': launch discovery was limited to the latest 10000 events from the last 7 days.') }
    $logStatuses.Add(@{ source = $source.Name; status = $discovery.status; message = $discovery.message })
  }
}

if ($null -ne $game) {
  $logStatuses.Clear()
  # Read a one-second margin for event write delay; exact five-minute filtering happens in TypeScript.
  $from = [DateTimeOffset]::FromUnixTimeMilliseconds($game.startedAt - 301000).LocalDateTime
  $until = [DateTimeOffset]::FromUnixTimeMilliseconds($game.startedAt + 1000).LocalDateTime
  foreach ($source in $sources) {
    $window = Read-LaunchLog $source $from $until 10000
    foreach ($record in $window.records) { $history.Add($record) }
    $logStatuses.Add(@{ source = $source.Name; status = $window.status; message = $window.message })
  }
}

# An empty PowerShell pipeline can serialize as {} rather than JSON null.
if ($null -eq $game) { $game = $null }
@{ checkedAt = $checkedAt; liveAvailable = $liveAvailable; live = @($live.ToArray()); unknownLivePids = @($unknownLivePids.ToArray());
   game = $game; history = @($history.ToArray()); logs = @($logStatuses.ToArray());
   warnings = @($warnings.ToArray()) } | ConvertTo-Json -Depth 6 -Compress
`
