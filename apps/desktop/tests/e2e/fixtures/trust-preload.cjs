const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("trustTest", {
  invoke: (message) => ipcRenderer.invoke("repo-edu/entry", message),
  send: (message) => ipcRenderer.send("repo-edu/entry", message),
})
