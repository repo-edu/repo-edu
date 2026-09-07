import { contextBridge, ipcRenderer } from "electron"
import {
  type DesktopTrpcBridge,
  desktopEntryChannel,
  desktopTrpcResponseChannel,
} from "./desktop-wire"
import {
  createPreloadRequestTransport,
  rendererRequestPort,
} from "./preload-request-transport"
import type { RendererCloseHandler } from "./renderer-close"
import {
  type DesktopRendererHostBridge,
  type DownloadProgress,
  desktopRendererHostChannels,
} from "./renderer-host-bridge"
import { closeTransferSchema, requestPortChannel } from "./request-port-wire"

const desktopTrpcBridge: DesktopTrpcBridge = {
  send(message) {
    ipcRenderer.send(desktopEntryChannel, { kind: "trpc", message })
  },
  subscribe(handler) {
    const receive = (
      _event: Electron.IpcRendererEvent,
      message: Parameters<typeof handler>[0],
    ) => handler(message)
    ipcRenderer.on(desktopTrpcResponseChannel, receive)
    return () => {
      ipcRenderer.removeListener(desktopTrpcResponseChannel, receive)
    }
  },
}

let closeCallback: RendererCloseHandler | null = null
let closeCancelCallback: ((attemptId: string) => void) | null = null

const requestTransport = createPreloadRequestTransport({
  channel(command) {
    const { port1, port2 } = new MessageChannel()
    return {
      renderer: rendererRequestPort(port1),
      transfer() {
        try {
          ipcRenderer.postMessage(
            desktopEntryChannel,
            { kind: "command-intent", workflowId: command },
            [port2],
          )
        } catch (error) {
          port2.close()
          throw error
        }
      },
    }
  },
  terminal() {
    // Endpoint failure closes the live port. Its peer reports that loss to the
    // host reducer, without creating a second renderer-to-host control route.
    console.error("The desktop request port failed.")
  },
})

ipcRenderer.on(requestPortChannel, (event, message: unknown) => {
  if (
    !closeTransferSchema.safeParse(message).success ||
    event.ports.length !== 1
  ) {
    for (const port of event.ports) port.close()
    requestTransport.dispose()
    throw new Error("Malformed desktop close-port transfer.")
  }
  requestTransport.close(rendererRequestPort(event.ports[0]))
})

const desktopHostBridge: DesktopRendererHostBridge = {
  async bootstrapReady() {
    await ipcRenderer.invoke(desktopEntryChannel, { action: "bootstrapReady" })
  },
  async pickUserFile(options) {
    return await ipcRenderer.invoke(desktopEntryChannel, {
      action: "pickUserFile",
      input: options,
    })
  },

  async pickSaveTarget(options) {
    return await ipcRenderer.invoke(desktopEntryChannel, {
      action: "pickSaveTarget",
      input: options,
    })
  },

  async pickDirectory(options) {
    return await ipcRenderer.invoke(desktopEntryChannel, {
      action: "pickDirectory",
      input: options,
    })
  },

  async setNativeTheme(theme) {
    await ipcRenderer.invoke(desktopEntryChannel, {
      action: "setNativeTheme",
      input: theme,
    })
  },

  onCloseRequest(callback) {
    closeCallback = callback
    return () => {
      if (closeCallback === callback) closeCallback = null
    }
  },

  onCloseCancel(callback) {
    closeCancelCallback = callback
    return () => {
      if (closeCancelCallback === callback) closeCancelCallback = null
    }
  },

  onUpdateAvailable(callback) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: { version: string },
    ) => {
      callback(info)
    }
    ipcRenderer.on(desktopRendererHostChannels.onUpdateAvailable, handler)
    return () => {
      ipcRenderer.removeListener(
        desktopRendererHostChannels.onUpdateAvailable,
        handler,
      )
    }
  },

  onUpdateDownloaded(callback) {
    const handler = () => {
      callback()
    }
    ipcRenderer.on(desktopRendererHostChannels.onUpdateDownloaded, handler)
    return () => {
      ipcRenderer.removeListener(
        desktopRendererHostChannels.onUpdateDownloaded,
        handler,
      )
    }
  },

  onUpdateError(callback) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      error: { message: string },
    ) => {
      callback(error)
    }
    ipcRenderer.on(desktopRendererHostChannels.onUpdateError, handler)
    return () => {
      ipcRenderer.removeListener(
        desktopRendererHostChannels.onUpdateError,
        handler,
      )
    }
  },

  onDownloadProgress(callback) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: DownloadProgress,
    ) => {
      callback(progress)
    }
    ipcRenderer.on(desktopRendererHostChannels.onDownloadProgress, handler)
    return () => {
      ipcRenderer.removeListener(
        desktopRendererHostChannels.onDownloadProgress,
        handler,
      )
    }
  },

  async downloadUpdate() {
    await ipcRenderer.invoke(desktopEntryChannel, { action: "downloadUpdate" })
  },

  async quitAndInstall() {
    await ipcRenderer.invoke(desktopEntryChannel, { action: "quitAndInstall" })
  },
}

process.once("loaded", () => {
  contextBridge.exposeInMainWorld("repoEduTrpc", desktopTrpcBridge)
  contextBridge.exposeInMainWorld("repoEduDesktopHost", desktopHostBridge)
  contextBridge.exposeInMainWorld("repoEduRequests", requestTransport.bridge)
})
