import { contextBridge, ipcRenderer } from "electron"
import "../../../src/preload"

// Adversarial test access lives only in this fixture, outside the shipped bridge.
let port: MessagePort
const received: unknown[] = []
let closed = false
contextBridge.exposeInMainWorld("rawRequest", {
  begin() {
    const channel = new MessageChannel()
    port = channel.port1
    port.onmessage = (event) => received.push(event.data)
    port.addEventListener("close", () => {
      closed = true
    })
    port.start()
    ipcRenderer.postMessage(
      "repo-edu/entry",
      {
        kind: "command-intent",
        workflowId: "userFile.exportPreview",
      },
      [channel.port2],
    )
  },
  send(message: unknown, transfer = false) {
    if (transfer) {
      const channel = new MessageChannel()
      channel.port1.close()
      port.postMessage(message, [channel.port2])
    } else port.postMessage(message)
  },
  drop() {
    port.close()
  },
  snapshot() {
    return { received, closed }
  },
})
