import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { buildUnturnedLaunchResult } from '../src/main/services/unturned-launch-model.ts'
import { UNTURNED_LAUNCH_SCRIPT } from '../src/main/services/unturned-launch-script.ts'

const runFile = promisify(execFile)
const gameTime = Date.UTC(2026, 8, 28, 0, 2)
const record = (pid, startedAt, name = 'tool.exe', source = 'Security 4688', path = `C:\\Apps\\${name}`) =>
  ({ pid, startedAt, name, source, path })
const game = record(100, gameTime, 'Unturned.exe', 'Running processes')
const snapshot = (changes = {}) => ({
  checkedAt: gameTime + 600000, liveAvailable: true, unknownLivePids: [], live: [game], game,
  history: [], logs: [], warnings: [], ...changes
})

test('exact five-minute window crosses midnight and excludes the game and later starts', () => {
  const result = buildUnturnedLaunchResult(snapshot({ history: [
    record(1, gameTime - 300001), record(2, gameTime - 300000),
    record(3, gameTime - 1), record(4, gameTime), record(5, gameTime + 1)
  ] }))
  assert.deepEqual(result.processes.map(item => item.pid), [3, 2])
  assert.equal(result.windowStart, gameTime - 300000)
})

test('closed programs and live programs are included without keyword filtering', () => {
  const live = record(1, gameTime - 20000, 'ordinary.exe', 'Running processes')
  const closed = record(2, gameTime - 30000, 'closed.exe')
  const result = buildUnturnedLaunchResult(snapshot({ live: [game, live], history: [closed] }))
  assert.equal(result.processes[0].state, 'running')
  assert.equal(result.processes[1].state, 'not-running')
})

test('duplicates from both logs and CIM are merged, preferring the live start time', () => {
  const live = record(1, gameTime - 300000, 'tool.exe', 'Running processes')
  const security = { ...live, source: 'Security 4688', startedAt: live.startedAt + 150 }
  const sysmon = { ...live, source: 'Sysmon 1' }
  const result = buildUnturnedLaunchResult(snapshot({ live: [game, live], history: [security, sysmon] }))
  assert.equal(result.processes.length, 1)
  assert.equal(result.processes[0].startedAt, live.startedAt)
  assert.equal(result.processes[0].sources.length, 3)
})

test('PID reuse does not make a closed process look running or collapse repeated launches', () => {
  const current = record(1, gameTime + 2000, 'tool.exe', 'Running processes')
  const result = buildUnturnedLaunchResult(snapshot({ live: [game, current], history: [
    record(1, gameTime - 10000), record(1, gameTime - 60000)
  ] }))
  assert.equal(result.processes.length, 2)
  assert.ok(result.processes.every(item => item.state === 'not-running'))
})

test('inaccessible live list or creation date means unknown state', () => {
  const history = [record(1, gameTime - 10000)]
  assert.equal(buildUnturnedLaunchResult(snapshot({ history, live: [], liveAvailable: false })).processes[0].state, 'unknown')
  assert.equal(buildUnturnedLaunchResult(snapshot({ history, unknownLivePids: [1] })).processes[0].state, 'unknown')
})

test('no game produces no invented anchor and retains availability warnings', () => {
  const result = buildUnturnedLaunchResult(snapshot({ game: null, warnings: ['Missing history'] }))
  assert.equal(result.game, null)
  assert.equal(result.windowStart, null)
  assert.deepEqual(result.processes, [])
  assert.deepEqual(result.warnings, ['Missing history'])
})

test('history-only game uses Sysmon process time and merges its sources', () => {
  const securityGame = { ...game, source: 'Security 4688', startedAt: gameTime + 200 }
  const sysmonGame = { ...game, source: 'Sysmon 1' }
  const result = buildUnturnedLaunchResult(snapshot({
    live: [], game: securityGame, history: [securityGame, sysmonGame, record(3, gameTime + 100)]
  }))
  assert.equal(result.game.startedAt, gameTime)
  assert.equal(result.game.state, 'not-running')
  assert.equal(result.game.sources.length, 2)
  assert.equal(result.processes.length, 0)
})

test('invalid timestamps and unrelated executable paths are not merged', () => {
  const result = buildUnturnedLaunchResult(snapshot({ history: [
    record(1, NaN), record(2, gameTime - 10000),
    record(2, gameTime - 10000, 'tool.exe', 'Sysmon 1', 'D:\\Other\\tool.exe')
  ] }))
  assert.equal(result.processes.length, 2)
})

// Exercise the real Windows PowerShell parser and XML field extraction with deterministic
// fake OS data. No event logs, auditing settings, or running processes are changed.
test('PowerShell collector reads closed game events, hex PIDs and UTF-8 paths', { skip: process.platform !== 'win32' }, async () => {
  const fixture = String.raw`
function Get-CimInstance { return @() }
function New-FixtureEvent($image, $processNumber, $utc, $sysmon) {
  $time = [DateTime]::Parse($utc).ToUniversalTime()
  if ($sysmon) {
    $payload = "<Data Name='Image'>$image</Data><Data Name='ProcessId'>$processNumber</Data><Data Name='UtcTime'>$utc</Data>"
  } else {
    $hex = '0x' + ([long]$processNumber).ToString('x')
    $payload = "<Data Name='NewProcessName'>$image</Data><Data Name='NewProcessId'>$hex</Data>"
  }
  $entry = [pscustomobject]@{ TimeCreated = $time; XmlText = "<Event><EventData>$payload</EventData></Event>" }
  $entry | Add-Member -MemberType ScriptMethod -Name ToXml -Value { return $this.XmlText }
  $entry | Add-Member -MemberType ScriptMethod -Name Dispose -Value {}
  return $entry
}
function Get-WinEvent {
  [CmdletBinding()] param($ListLog, $FilterHashtable, $MaxEvents)
  if ($ListLog) { return [pscustomobject]@{ IsEnabled = $true } }
  $sysmon = $FilterHashtable.Id -eq 1
  New-FixtureEvent 'C:\Games\Unturned.exe' 100 '2026-09-28T00:02:00Z' $sysmon
  New-FixtureEvent 'C:\Программы\closed.exe' 321 '2026-09-27T23:59:00Z' $sysmon
}
`
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const { stdout } = await runFile(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(fixture + UNTURNED_LAUNCH_SCRIPT, 'utf16le').toString('base64')],
  { windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 })
  const raw = JSON.parse(stdout.trim())
  assert.equal(raw.game.pid, 100)
  assert.equal(raw.history.length, 4)
  const result = buildUnturnedLaunchResult(raw)
  assert.equal(result.processes.length, 1)
  assert.equal(result.processes[0].pid, 321)
  assert.equal(result.processes[0].path, 'C:\\Программы\\closed.exe')
  assert.equal(result.processes[0].state, 'not-running')
  assert.ok(result.logs.every(log => log.status === 'available'))
})

test('PowerShell collector reports missing logs without claiming a clean history', { skip: process.platform !== 'win32' }, async () => {
  const fixture = `
function Get-CimInstance { throw 'Access denied' }
function Get-WinEvent { throw 'Missing log' }
`
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const { stdout } = await runFile(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(fixture + UNTURNED_LAUNCH_SCRIPT, 'utf16le').toString('base64')],
  { windowsHide: true, encoding: 'utf8', timeout: 15000 })
  const raw = JSON.parse(stdout.trim())
  assert.equal(raw.game, null)
  assert.equal(raw.liveAvailable, false)
  assert.ok(raw.logs.every(log => log.status === 'unavailable'))
  assert.equal(raw.warnings.length, 1)
})
