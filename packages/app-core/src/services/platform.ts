import type {
  CloseRequestedHandler,
  OpenDialogOptions,
  SaveDialogOptions,
  WindowTheme,
} from "@repo-edu/backend-interface"
import { getBackend } from "./backend"

export const openDialog = (options: OpenDialogOptions) =>
  getBackend().openDialog(options)

export const saveDialog = (options: SaveDialogOptions) =>
  getBackend().saveDialog(options)

export const listenEvent = <T = unknown>(
  event: string,
  handler: (payload: T) => void,
) => getBackend().listenEvent(event, handler)

export const onCloseRequested = (handler: CloseRequestedHandler) =>
  getBackend().onCloseRequested(handler)

export const closeWindow = () => getBackend().closeWindow()

export const setWindowTheme = (theme: WindowTheme) =>
  getBackend().setWindowTheme(theme)

export const setWindowBackgroundColor = (color: string) =>
  getBackend().setWindowBackgroundColor(color)
