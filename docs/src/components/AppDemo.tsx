import { AppRoot, BackendProvider, setBackend } from "@repo-edu/app-core"
import "@repo-edu/app-core/src/App.css"
import { MockBackend } from "@repo-edu/backend-mock"
import { SheetPortalProvider } from "@repo-edu/ui"
import { useEffect, useRef, useState } from "react"

export default function AppDemo() {
  const [backend] = useState(() => new MockBackend())
  const [ready, setReady] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setBackend(backend)
    setReady(true)
  }, [backend])

  if (!ready) return null

  return (
    <div
      ref={containerRef}
      className="not-content"
      style={{
        height: "800px",
        border: "1px solid var(--sl-color-gray-5)",
        borderRadius: "0.5rem",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <style>{`
          body {
            overflow: auto !important;
          }
          #root {
            min-height: 0 !important;
            height: 100%;
          }
          .repobee-container {
            height: 100% !important;
            min-height: 0 !important;
          }
          [data-slot="sheet-overlay"],
          [data-slot="sheet-content"] {
            position: absolute !important;
          }
        `}</style>
      <SheetPortalProvider container={containerRef.current}>
        <BackendProvider backend={backend}>
          <AppRoot />
        </BackendProvider>
      </SheetPortalProvider>
    </div>
  )
}
