import { lstat, opendir, realpath } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { LatestFile, LatestFilesResult } from '../../shared/types'

const METADATA_CONCURRENCY = 4

function insertLatest(files: LatestFile[], file: LatestFile, limit: number): void {
  // Keep only the small sorted top-N, rather than sorting it after every file.
  let low = 0
  let high = files.length
  while (low < high) {
    const mid = (low + high) >>> 1
    const order = files[mid].modifiedAt - file.modifiedAt || file.relativePath.localeCompare(files[mid].relativePath)
    if (order < 0) high = mid
    else low = mid + 1
  }
  if (low >= limit) return
  files.splice(low, 0, file)
  if (files.length > limit) files.pop()
}

/** Read metadata only; never execute files or follow directory links/junctions. */
export async function findLatestFiles(folder: string, now = new Date(), limit = 2): Promise<LatestFilesResult> {
  if (!Number.isInteger(limit) || limit < 2 || limit > 30) {
    throw new Error('The file count must be a whole number from 2 to 30.')
  }
  // Capture one local calendar day for the whole scan, including across midnight.
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const from = dayStart.getTime()
  const until = nextDay.getTime()
  const root = await realpath(folder)
  if (!(await lstat(root)).isDirectory()) throw new Error('The selected path is not a folder.')
  const result: LatestFilesResult = { folder: root, scanDate: from, limit, groups: [], scannedFiles: 0, scannedFolders: 0, skippedEntries: 0 }
  const pending = [root]

  while (pending.length > 0) {
    const directory = pending.pop()!
    const files: LatestFile[] = []
    const metadata: Promise<void>[] = []

    const inspectFile = async (path: string, name: string): Promise<void> => {
      try {
        const stats = await lstat(path)
        if (stats.isSymbolicLink()) {
          result.skippedEntries++
        } else if (stats.isDirectory()) {
          pending.push(path)
        } else if (stats.isFile()) {
          result.scannedFiles++
          if (stats.mtimeMs < from || stats.mtimeMs >= until) return
          if (files.length === limit && stats.mtimeMs < files[files.length - 1].modifiedAt) return
          insertLatest(files, {
            name, path, relativePath: relative(root, path), modifiedAt: stats.mtimeMs, size: stats.size
          }, limit)
        }
      } catch {
        result.skippedEntries++
      }
    }
    try {
      // Recheck queued directories: a junction must not lead the scan outside the tree.
      const directoryStat = await lstat(directory)
      if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
        result.skippedEntries++
        continue
      }
      const entries = await opendir(directory, { bufferSize: 128 })
      result.scannedFolders++
      for await (const entry of entries) {
        const path = join(directory, entry.name)
        // Directory entries already carry their type: don't stat each folder twice.
        if (entry.isSymbolicLink()) {
          result.skippedEntries++
        } else if (entry.isDirectory()) {
          pending.push(path)
        } else if (entry.isFile()) {
          metadata.push(inspectFile(path, entry.name))
          if (metadata.length === METADATA_CONCURRENCY) {
            await Promise.all(metadata)
            metadata.length = 0
          }
        }
      }
    } catch (error) {
      if (directory === root) throw error
      result.skippedEntries++
    } finally {
      await Promise.all(metadata)
      if (files.length > 0) result.groups.push({ path: directory, relativePath: relative(root, directory), files })
    }
  }
  result.groups.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return result
}
