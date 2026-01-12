import { AppRoot, BackendProvider, setBackend } from "@repo-edu/app-core"
import "@repo-edu/app-core/src/App.css"
import { MockBackend } from "@repo-edu/backend-mock"
import { useEffect, useState } from "react"

export default function DemoApp() {
  const [backend] = useState(() => new MockBackend())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setBackend(backend)
    setReady(true)
  }, [backend])

  if (!ready) return null

  return (
    <BackendProvider backend={backend}>
      <AppRoot />
    </BackendProvider>
  )
}
