import type { ThemePreference } from "@repo-edu/domain/settings"
import type { FileFormat } from "@repo-edu/domain/types"
import type {
  UserFileRef,
  UserSaveTargetRef,
} from "@repo-edu/host-runtime-contract"

export const packageId = "@repo-edu/renderer-host-contract"

export type RendererOpenUserFileRef = UserFileRef
export type RendererSaveTargetRef = UserSaveTargetRef

export type OpenUserFileDialogOptions = {
  title?: string
  acceptFormats?: readonly FileFormat[]
}

export type SaveUserFileDialogOptions = {
  title?: string
  suggestedName?: string
  defaultFormat?: FileFormat
}

export type PickDirectoryOptions = {
  title?: string
}

export type RendererHost = {
  pickUserFile(
    options?: OpenUserFileDialogOptions,
  ): Promise<RendererOpenUserFileRef | null>
  pickSaveTarget(
    options?: SaveUserFileDialogOptions,
  ): Promise<RendererSaveTargetRef | null>
  pickDirectory(options?: PickDirectoryOptions): Promise<string | null>
  openExternalUrl(url: string): Promise<void>
  setNativeTheme(theme: ThemePreference): Promise<void>
  revealCoursesDirectory(): Promise<void>
  onCloseRequest(callback: (attemptId: string) => Promise<void>): () => void
  onCloseCancel(callback: (attemptId: string) => void): () => void
}
