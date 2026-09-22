import { create } from 'zustand'
import type { LatestFilesResult } from '../../shared/types'

interface LatestFilesState {
  limit: number
  setLimit: (limit: number) => void
  result: LatestFilesResult | null
  busy: boolean
  error: string | null
  scan: (chooseFolder: boolean) => Promise<void>
}

// Keep results and in-flight state when switching sidebar pages.
export const useLatestFilesStore = create<LatestFilesState>((set, get) => ({
  limit: 2,
  setLimit: (limit) => {
    if (get().busy || !Number.isInteger(limit) || limit < 2 || limit > 30 || limit === get().limit) return
    set({ limit })
    const result = get().result
    // Reuse today's top-30 snapshot. A new calendar day needs a fresh scan.
    if (result && new Date(result.scanDate).toDateString() !== new Date().toDateString()) {
      void get().scan(false)
    }
  },
  result: null,
  busy: false,
  error: null,
  scan: async (chooseFolder) => {
    if (get().busy) return
    set({ busy: true, error: null })
    try {
      const result = chooseFolder
        ? await window.electronAPI.selectLatestFilesFolder(30)
        : await window.electronAPI.refreshLatestFiles(30)
      if (result) set({ result })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unable to read the folder.' })
    } finally {
      set({ busy: false })
    }
  }
}))
