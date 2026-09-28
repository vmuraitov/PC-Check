import { create } from 'zustand'
import type { UnturnedLaunchResult } from '../../shared/types'

interface UnturnedLaunchesState {
  result: UnturnedLaunchResult | null
  busy: boolean
  error: string | null
  refresh: () => Promise<void>
}

export const useUnturnedLaunchesStore = create<UnturnedLaunchesState>((set, get) => ({
  result: null,
  busy: false,
  error: null,
  refresh: async () => {
    if (get().busy) return
    set({ busy: true, error: null })
    try {
      const result = await window.electronAPI.getUnturnedLaunches()
      set({ result })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unable to read launch history.' })
    } finally {
      set({ busy: false })
    }
  }
}))
