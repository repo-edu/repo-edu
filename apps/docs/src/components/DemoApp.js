import { AppRoot } from "@repo-edu/app"
import { useMemo } from "react"
import { jsx as _jsx } from "react/jsx-runtime"
import { createDocsDemoRuntime } from "../demo-runtime.js"
export default function DemoApp() {
  const runtime = useMemo(() => createDocsDemoRuntime(), [])
  return _jsx(AppRoot, {
    workflowClient: runtime.workflowClient,
    rendererHost: runtime.rendererHost,
  })
}
