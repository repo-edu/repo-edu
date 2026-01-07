/**
 * App settings hook - provides access to app-level settings from the store.
 *
 * Wraps the appSettingsStore for convenient access in components.
 */

import { useCallback } from "react"
import type { GitConnection, LmsConnection, Theme } from "../bindings/types"
import { useAppSettingsStore } from "../stores/appSettingsStore"

type StoreStatus = "loading" | "loaded" | "saving" | "error"

export interface UseAppSettingsReturn {
  theme: Theme
  lmsConnection: LmsConnection | null
  gitConnections: Record<string, GitConnection>
  status: StoreStatus
  error: string | null
  save: () => Promise<void>
  load: () => Promise<void>
}

export function useAppSettings(): UseAppSettingsReturn {
  const theme = useAppSettingsStore((state) => state.theme)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const gitConnections = useAppSettingsStore((state) => state.gitConnections)
  const status = useAppSettingsStore((state) => state.status)
  const error = useAppSettingsStore((state) => state.error)
  const storeSave = useAppSettingsStore((state) => state.save)
  const storeLoad = useAppSettingsStore((state) => state.load)

  const save = useCallback(async () => {
    await storeSave()
  }, [storeSave])

  const load = useCallback(async () => {
    await storeLoad()
  }, [storeLoad])

  return {
    theme,
    lmsConnection,
    gitConnections,
    status,
    error,
    save,
    load,
  }
}
