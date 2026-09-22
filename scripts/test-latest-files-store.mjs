import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useLatestFilesStore } from '../src/renderer/stores/latest-files-store.ts'

test('changing the display limit reuses top-30 results; refresh and a new day rescan', async () => {
  const previousWindow = globalThis.window
  const previousState = useLatestFilesStore.getState()
  let reads = 0
  const limits = []
  const mockScan = async limit => {
    reads++
    limits.push(limit)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return { folder: 'fixture', scanDate: today.getTime(), limit, groups: [], scannedFiles: 0, scannedFolders: 1, skippedEntries: 0 }
  }
  globalThis.window = { electronAPI: { selectLatestFilesFolder: mockScan, refreshLatestFiles: mockScan } }
  try {
    useLatestFilesStore.setState({ result: null, limit: 2, busy: false, error: null })
    await useLatestFilesStore.getState().scan(true)
    const snapshot = useLatestFilesStore.getState().result
    for (const limit of [30, 7, 2]) useLatestFilesStore.getState().setLimit(limit)
    assert.equal(reads, 1)
    assert.equal(useLatestFilesStore.getState().result, snapshot)
    await useLatestFilesStore.getState().scan(false)
    assert.equal(reads, 2)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    useLatestFilesStore.setState({ result: { ...snapshot, scanDate: yesterday.getTime() } })
    useLatestFilesStore.getState().setLimit(10)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(reads, 3)
    assert.deepEqual(limits, [30, 30, 30])
    assert.equal(useLatestFilesStore.getState().limit, 10)
  } finally {
    useLatestFilesStore.setState(previousState, true)
    globalThis.window = previousWindow
  }
})
