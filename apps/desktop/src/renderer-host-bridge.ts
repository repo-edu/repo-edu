import type {
  OpenUserFileDialogOptions,
  PickDirectoryOptions,
  RendererEnvironmentSnapshot,
  RendererHost,
  RendererOpenUserFileRef,
  RendererSaveTargetRef,
  SaveUserFileDialogOptions,
} from "@repo-edu/renderer-host-contract"

export const desktopRendererHostChannels = {
  pickUserFile: "repo-edu/renderer-host/pick-user-file",
  pickSaveTarget: "repo-edu/renderer-host/pick-save-target",
  pickDirectory: "repo-edu/renderer-host/pick-directory",
  openExternalUrl: "repo-edu/renderer-host/open-external-url",
  getEnvironmentSnapshot: "repo-edu/renderer-host/get-environment-snapshot",
  setNativeTheme: "repo-edu/renderer-host/set-native-theme",
  revealCoursesDirectory: "repo-edu/renderer-host/reveal-courses-directory",
} as const

export type DesktopRendererHostBridge = {
  pickUserFile(
    options?: OpenUserFileDialogOptions,
  ): Promise<RendererOpenUserFileRef | null>
  pickSaveTarget(
    options?: SaveUserFileDialogOptions,
  ): Promise<RendererSaveTargetRef | null>
  pickDirectory(options?: PickDirectoryOptions): Promise<string | null>
  openExternalUrl(url: string): Promise<void>
  getEnvironmentSnapshot(): Promise<RendererEnvironmentSnapshot>
  setNativeTheme(theme: "light" | "dark" | "system"): Promise<void>
  revealCoursesDirectory(): Promise<void>
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
    openExternalUrl(url) {
      return bridge.openExternalUrl(url)
    },
    getEnvironmentSnapshot() {
      return bridge.getEnvironmentSnapshot()
    },
  }
}

declare global {
  interface Window {
    repoEduDesktopHost?: DesktopRendererHostBridge
  }
}
