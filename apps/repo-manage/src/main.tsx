import { AppRoot, BackendProvider, setBackend } from "@repo-edu/app-core"
import React from "react"
import ReactDOM from "react-dom/client"
import { TauriBackend } from "./bindings/tauri"
import "@repo-edu/app-core/src/App.css" // Import styles

const backend = new TauriBackend()
setBackend(backend)

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BackendProvider backend={backend}>
      <AppRoot />
    </BackendProvider>
  </React.StrictMode>,
)
