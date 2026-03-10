import { AppRoot } from "@repo-edu/app"
import { useMemo } from "react"
import "../../../../packages/app/src/App.css"
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
