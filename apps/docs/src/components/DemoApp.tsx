import { AppRoot } from "@repo-edu/renderer-app"
import { useMemo } from "react"
import "../../../../packages/renderer-app/src/App.css"
import { createDocsDemoRuntime } from "../demo-runtime.js"

export default function DemoApp() {
  const runtime = useMemo(() => createDocsDemoRuntime(), [])

  return (
    <AppRoot
      workflowClient={runtime.workflowClient}
      rendererHost={runtime.rendererHost}
    />
  )
}
