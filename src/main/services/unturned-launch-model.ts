import type { LaunchLogStatus, LaunchSource, ProcessLaunch, UnturnedLaunchResult } from '../../shared/types'

export interface LaunchRecord {
  name: string
  path: string
  pid: number
  startedAt: number
  source: LaunchSource
}

export interface LaunchSnapshot {
  checkedAt: number
  liveAvailable: boolean
  unknownLivePids: number[]
  live: LaunchRecord[]
  game: LaunchRecord | null
  history: LaunchRecord[]
  logs: LaunchLogStatus[]
  warnings: string[]
}

const WINDOW_MS = 5 * 60 * 1000
// Windows log timestamps can differ slightly from CIM CreationDate.
const CLOCK_TOLERANCE_MS = 1000

function sameLaunch(a: LaunchRecord, b: LaunchRecord): boolean {
  return a.pid === b.pid && a.name.toLowerCase() === b.name.toLowerCase() &&
    Math.abs(a.startedAt - b.startedAt) <= CLOCK_TOLERANCE_MS &&
    (!a.path || !b.path || a.path.toLowerCase() === b.path.toLowerCase())
}

function validRecord(record: LaunchRecord): boolean {
  return Boolean(record.name) && Number.isInteger(record.pid) && record.pid >= 0 &&
    Number.isFinite(record.startedAt) && record.startedAt > 0
}

export function buildUnturnedLaunchResult(snapshot: LaunchSnapshot): UnturnedLaunchResult {
  const result: UnturnedLaunchResult = {
    checkedAt: snapshot.checkedAt,
    game: null,
    windowStart: null,
    processes: [],
    logs: snapshot.logs,
    warnings: [...snapshot.warnings]
  }
  const history = snapshot.history.filter(validRecord).sort((a, b) =>
    Number(b.source === 'Sysmon 1') - Number(a.source === 'Sysmon 1'))
  let game = snapshot.game
  if (!game || !validRecord(game) || game.name.toLowerCase() !== 'unturned.exe') return result
  if (game.source !== 'Running processes') {
    game = history.find(record => record.source === 'Sysmon 1' && sameLaunch(record, game!)) || game
  }

  const live = snapshot.live.filter(validRecord)
  const liveByPid = new Map(live.map(record => [record.pid, record]))
  const toProcess = (record: LaunchRecord): ProcessLaunch => {
    const current = liveByPid.get(record.pid)
    const running = current && sameLaunch(record, current)
    return {
      ...record,
      path: record.path || (running ? current.path : ''),
      sources: running ? [...new Set([record.source, current.source])] : [record.source],
      state: running ? 'running' : snapshot.liveAvailable && !snapshot.unknownLivePids.includes(record.pid) ? 'not-running' : 'unknown'
    }
  }
  result.game = toProcess(game)
  for (const record of history) {
    if (sameLaunch(record, game) && !result.game.sources.includes(record.source)) result.game.sources.push(record.source)
  }
  result.windowStart = game.startedAt - WINDOW_MS

  // Merge sources by PID, image and creation time, never by PID alone (PIDs are reused).
  // A live creation timestamp is preferred over the timestamp when an event was written.
  const groups = new Map<number, { record: LaunchRecord; process: ProcessLaunch }[]>()
  for (const record of [...live, ...history]) {
    const bucket = groups.get(record.pid) || []
    const existing = bucket.find(entry => sameLaunch(entry.record, record))
    if (existing) {
      if (!existing.process.sources.includes(record.source)) existing.process.sources.push(record.source)
      if (!existing.process.path) existing.process.path = record.path
    } else {
      bucket.push({ record, process: toProcess(record) })
      groups.set(record.pid, bucket)
    }
  }
  result.processes = [...groups.values()].flatMap(bucket => bucket.map(entry => entry.process))
    .filter(record => record.startedAt >= result.windowStart! && record.startedAt < game.startedAt)
    .sort((a, b) => b.startedAt - a.startedAt || a.pid - b.pid)
  return result
}
