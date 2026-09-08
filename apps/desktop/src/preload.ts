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
import type { DesktopRendererHostBridge } from "./renderer-host-bridge"
import { createRequestPersistenceExchange } from "./request-persistence-exchange"
import { closeTransferSchema, requestPortChannel } from "./request-port-wire"
import { parseUpdaterMessage, updaterMessageChannels } from "./updater-wire"

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
    return requestTransport.bridge.onClose((request) => {
      const exchange = createRequestPersistenceExchange(request)
      const unexpected = () => {
        throw new Error("Unexpected command message on close port.")
      }
      return {
        admission: unexpected,
        prepare() {
          void callback(exchange.commit).then(
            () => request.readyToClose(),
            (error: unknown) =>
              request.fail(
                error instanceof Error ? error.message : String(error),
              ),
          )
        },
        persisted: exchange.persisted,
        failed: exchange.failed,
        progress: unexpected,
        output: unexpected,
        settlement: unexpected,
        released: unexpected,
        closeAcknowledged() {},
      }
    })
  },

  onCloseCancel(callback) {
    closeCancelCallback = callback
    return () => {
      if (closeCancelCallback === callback) closeCancelCallback = null
    }
  },

  onUpdateAvailable(callback) {
    const handler = (_event: Electron.IpcRendererEvent, info: unknown) => {
      callback(parseUpdaterMessage("onUpdateAvailable", info))
    }
    ipcRenderer.on(updaterMessageChannels.onUpdateAvailable, handler)
    return () => {
      ipcRenderer.removeListener(
        updaterMessageChannels.onUpdateAvailable,
        handler,
      )
    }
  },

  onUpdateDownloaded(callback) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      parseUpdaterMessage("onUpdateDownloaded", payload)
      callback()
    }
    ipcRenderer.on(updaterMessageChannels.onUpdateDownloaded, handler)
    return () => {
      ipcRenderer.removeListener(
        updaterMessageChannels.onUpdateDownloaded,
        handler,
      )
    }
  },

  onUpdateError(callback) {
    const handler = (_event: Electron.IpcRendererEvent, error: unknown) => {
      callback(parseUpdaterMessage("onUpdateError", error))
    }
    ipcRenderer.on(updaterMessageChannels.onUpdateError, handler)
    return () => {
      ipcRenderer.removeListener(updaterMessageChannels.onUpdateError, handler)
    }
  },

  onDownloadProgress(callback) {
    const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => {
      callback(parseUpdaterMessage("onDownloadProgress", progress))
    }
    ipcRenderer.on(updaterMessageChannels.onDownloadProgress, handler)
    return () => {
      ipcRenderer.removeListener(
        updaterMessageChannels.onDownloadProgress,
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
