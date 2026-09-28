import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useUnturnedLaunchesStore } from '../stores/unturned-launches-store'

const PAGE_SIZE = 50
const formatTime = (timestamp: number) => new Date(timestamp).toLocaleString('en-GB')
const stateLabels = {
  running: 'Running at check',
  'not-running': 'Not running at check',
  unknown: 'Current status unknown'
}

export function UnturnedLaunches() {
  const { result, busy, error, refresh } = useUnturnedLaunchesStore()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [result, search])
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (result?.processes || []).filter(item =>
      !query || `${item.name} ${item.path} ${item.pid}`.toLowerCase().includes(query))
  }, [result, search])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  const visibleRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto animate-fade-in space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Unturned Launches</h1>
          <p className="text-sm text-text-secondary mt-2">
            Find programs started in the 5 minutes before Unturned, including programs that have already closed.
            All names are included. Times use your computer's local time.
          </p>
        </div>
        <Card>
          <CardContent>
            <Button onClick={() => void refresh()} isLoading={busy} loadingText="Reading launch history...">
              {result ? 'Refresh' : 'Find launches'}
            </Button>
            <p className="text-xs text-text-secondary mt-3">
              Uses the newest running Unturned.exe. If the game is closed, searches saved launch events from the last 7 days
              (up to 10,000 events per log). Unturned_BE.exe is treated as a launcher, not the game.
            </p>
            <p className="text-xs text-text-muted mt-2">
              Closed programs can only be found if Windows recorded their launches. Missing, cleared or filtered logs cannot
              provide a complete history. DLL loads and file modification dates are not process launches.
            </p>
          </CardContent>
        </Card>
        {busy && <p role="status" className="text-sm text-text-secondary">Reading Windows records. This can take up to a minute.</p>}
        {error && <p role="alert" className="text-sm text-error bg-error/10 rounded-xl p-4">{error}</p>}
        {result && !busy && (
          <div className="space-y-4" aria-live="polite">
            <p className="text-xs text-text-muted">Checked: {formatTime(result.checkedAt)}. Process status is a snapshot; use Refresh to update it.</p>
            {error && <p className="text-sm text-warning">Showing results from the previous successful check.</p>}
            {result.warnings.map((warning, index) => <p key={index} className="text-sm text-warning">{warning}</p>)}
            <Card>
              <CardContent>
                <h2 className="font-semibold mb-2">History availability</h2>
                <ul className="space-y-2 text-sm">
                  {result.logs.map(log => (
                    <li key={log.source} className={log.status === 'available' ? 'text-text-secondary' : 'text-warning'}>
                      <span className="font-semibold">{log.source}: </span>{log.message}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text-muted mt-3">
                  Security history requires process creation auditing to have been enabled before the launches.
                  Sysmon history is available only if Sysmon was installed and recording. This tool does not change those settings.
                </p>
              </CardContent>
            </Card>
            {!result.game ? (
              <p className="text-text-secondary py-6">
                No Unturned.exe launch was found in running processes or the available history.
                Start Unturned and click Refresh. Missing past launch records cannot be recovered by this check.
              </p>
            ) : (
              <>
                <Card>
                  <CardContent>
                    <div className="flex flex-wrap justify-between gap-2">
                      <h2 className="font-semibold text-aurora-blue">Unturned.exe · PID {result.game.pid}</h2>
                      <span className="text-xs text-text-secondary">{stateLabels[result.game.state]}</span>
                    </div>
                    <p className="text-sm mt-2">Game started: {formatTime(result.game.startedAt)}</p>
                    <p className="font-mono text-xs text-text-muted break-all mt-2">{result.game.path || 'Executable path unavailable'}</p>
                    <p className="text-xs text-text-secondary mt-2">Source: {result.game.sources.join(', ')}</p>
                    <p className="text-sm text-text-secondary mt-3">
                      Search window: {formatTime(result.windowStart!)} to {formatTime(result.game.startedAt)} (before game start).
                    </p>
                  </CardContent>
                </Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-text-secondary">Launches found: {result.processes.length} · Showing: {rows.length}</p>
                  <input
                    type="search" aria-label="Filter processes" placeholder="Filter by name, path or PID"
                    value={search} onChange={event => setSearch(event.target.value)}
                    className="w-full sm:w-72 px-3 py-2 rounded-xl bg-background-elevated border border-border text-sm"
                  />
                </div>
                <p className="text-xs text-text-muted">Launching near the game does not prove that a program is a cheat or interacts with Unturned.</p>
                {rows.length === 0 ? (
                  <p className="text-text-secondary py-6">
                    {search ? 'No results match your filter.' : 'No launches were found in the available records for these 5 minutes. This does not confirm that no other programs were started.'}
                  </p>
                ) : (
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-background-elevated text-text-secondary">
                          <tr><th className="p-3">Program / path</th><th className="p-3">Started</th><th className="p-3">Status / source</th></tr>
                        </thead>
                        <tbody>
                          {visibleRows.map(item => (
                            <tr key={`${item.pid}:${item.startedAt}:${item.path}:${item.name}`} className="border-t border-border align-top">
                              <td className="p-3">
                                <p className="font-semibold break-all">{item.name} <span className="text-xs text-text-muted">PID {item.pid}</span></p>
                                <p className="font-mono text-xs text-text-muted break-all mt-1">{item.path || 'Executable path unavailable'}</p>
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <p>{formatTime(item.startedAt)}</p>
                                <p className="text-xs text-text-muted mt-1">{((result.game!.startedAt - item.startedAt) / 1000).toFixed(1)} s before game</p>
                              </td>
                              <td className="p-3">
                                <p className={item.state === 'running' ? 'text-success' : 'text-text-secondary'}>{stateLabels[item.state]}</p>
                                <p className="text-xs text-text-muted mt-1">{item.sources.join(', ')}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
                {pages > 1 && (
                  <div className="flex items-center justify-between gap-3">
                    <Button variant="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
                    <span className="text-sm text-text-secondary">Page {currentPage + 1} of {pages}</span>
                    <Button variant="secondary" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
