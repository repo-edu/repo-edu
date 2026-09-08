import type {
  OpenUserFileDialogOptions,
  PickDirectoryOptions,
  RendererHost,
  RendererOpenUserFileRef,
  RendererSaveTargetRef,
  SaveUserFileDialogOptions,
} from "@repo-edu/renderer-host-contract"

export type DownloadProgress = {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export type DesktopRendererHostBridge = {
  bootstrapReady(): Promise<void>
  pickUserFile(
    options?: OpenUserFileDialogOptions,
  ): Promise<RendererOpenUserFileRef | null>
  pickSaveTarget(
    options?: SaveUserFileDialogOptions,
  ): Promise<RendererSaveTargetRef | null>
  pickDirectory(options?: PickDirectoryOptions): Promise<string | null>
  setNativeTheme(theme: "light" | "dark" | "system"): Promise<void>
  onCloseRequest: RendererHost["onCloseRequest"]
  onCloseCancel(callback: (attemptId: string) => void): () => void
  onUpdateAvailable(callback: (info: { version: string }) => void): () => void
  onUpdateDownloaded(callback: () => void): () => void
  onUpdateError(callback: (error: { message: string }) => void): () => void
  onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void
  downloadUpdate(): Promise<void>
  quitAndInstall(): Promise<void>
}

export function createRendererHostFromBridge(
  bridge: DesktopRendererHostBridge,
): RendererHost {
  return {
    pickUserFile(options) {
      return bridge.pickUserFile(options)
    },
    pickSaveTarget(options) {
      return bridge.pickSaveTarget(options)
    },
    pickDirectory(options) {
      return bridge.pickDirectory(options)
    },
    setNativeTheme(theme) {
      return bridge.setNativeTheme(theme)
    },
    onCloseRequest(callback) {
      return bridge.onCloseRequest(callback)
    },
    onCloseCancel(callback) {
      return bridge.onCloseCancel(callback)
    },
  }
}

declare global {
  interface Window {
    repoEduDesktopHost?: DesktopRendererHostBridge
  }
}
