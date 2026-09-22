import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useLatestFilesStore } from '../stores/latest-files-store'

const GROUPS_PER_PAGE = 10
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'medium' })
const numberFormat = new Intl.NumberFormat('en-GB')

export function LatestFiles() {
  const { result, busy, error, scan, limit, setLimit } = useLatestFilesStore()
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [result])
  const pageCount = Math.ceil((result?.groups.length || 0) / GROUPS_PER_PAGE)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const visibleGroups = result?.groups.slice(currentPage * GROUPS_PER_PAGE, (currentPage + 1) * GROUPS_PER_PAGE) || []
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto animate-fade-in space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Latest Files</h1>
          <p className="text-sm text-text-secondary mt-2">
            Find the latest files modified today in each folder and its subfolders. Choose 2 to 30 files per folder. Dates use your computer's local time.
          </p>
        </div>
        <Card>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                Files per folder
                <select
                  value={limit}
                  onChange={event => setLimit(Number(event.target.value))}
                  disabled={busy}
                  className="h-10 px-3 rounded-xl bg-background-elevated text-text-primary border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-aurora-blue disabled:opacity-50"
                >
                  {Array.from({ length: 29 }, (_, i) => i + 2).map(count => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
              <Button onClick={() => void scan(true)} disabled={busy}>Choose folder</Button>
              {result && <Button variant="secondary" onClick={() => void scan(false)} disabled={busy}>Refresh</Button>}
            </div>
            <p className="mt-4 text-xs text-text-muted break-all font-mono">
              {result?.folder || 'Example: F:\\SteamLibrary\\steamapps\\common\\Unturned'}
            </p>
            <p className="mt-2 text-xs text-text-muted">Changing the count uses existing results. Click Refresh to check for new changes on disk.</p>
          </CardContent>
        </Card>
        {busy && (
          <div role="status" className="flex items-center gap-3 text-sm text-text-secondary">
            <span className="w-4 h-4 border-2 border-aurora-blue border-t-transparent rounded-full animate-spin" />
            Selecting a folder and finding files... Large folders may take a moment.
          </div>
        )}
        {error && <p role="alert" className="text-sm text-error bg-error/10 p-4 rounded-xl break-words">{error}</p>}
        {result && !busy && (
          <div className="space-y-3" aria-live="polite">
            <p className="text-sm font-semibold text-aurora-blue">Scan date: {new Date(result.scanDate).toLocaleDateString('en-GB')}</p>
            <p className="text-sm text-text-secondary">Folders checked: {numberFormat.format(result.scannedFolders)} · Files checked: {numberFormat.format(result.scannedFiles)}</p>
            <p className="text-xs text-text-muted">Each group shows up to {limit} files directly inside that folder. Folders with no files modified on this date are hidden.</p>
            {error && <p className="text-sm text-warning">Showing results from the previous successful search.</p>}
            {result.skippedEntries > 0 && (
              <p className="text-sm text-warning">
                Skipped items: {result.skippedEntries}. Inaccessible items and symbolic links were not checked. Results may be incomplete.
              </p>
            )}
            {result.groups.length === 0 && <p className="text-text-secondary py-6">No files modified on this date were found in accessible folders.</p>}
            {pageCount > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
                <span className="text-sm text-text-secondary">Page {currentPage + 1} of {pageCount} · Folders: {result.groups.length}</span>
                <Button variant="secondary" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button>
              </div>
            )}
            {visibleGroups.map(group => (
              <Card key={group.path}>
                <CardContent>
                  <h2 className="font-semibold text-aurora-blue break-all mb-4" title={group.path}>{group.relativePath || 'Selected folder'}</h2>
                  <div className="space-y-4">
                    {group.files.slice(0, limit).map((file, index) => (
                      <div key={file.path} className="flex items-start gap-3">
                        <span className="w-8 h-8 shrink-0 rounded-lg theme-active flex items-center justify-center font-bold">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-text-primary break-all">{file.name}</h3>
                          <p className="text-xs text-text-secondary font-mono break-all mt-2" title={file.path}>{file.path}</p>
                          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-sm text-text-secondary">
                            <p>Modified: <time dateTime={new Date(file.modifiedAt).toISOString()}>{dateTimeFormat.format(file.modifiedAt)}</time></p>
                            <p>{numberFormat.format(file.size)} bytes</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {!result && !busy && !error && <p className="text-text-muted text-sm py-8 text-center">Choose a folder to see results here.</p>}
      </div>
    </div>
  )
}
