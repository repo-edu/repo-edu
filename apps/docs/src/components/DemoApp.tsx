import { AppRoot } from "@repo-edu/app"
import { useMemo } from "react"
import "../../../../packages/app/src/App.css"
import { createDocsDemoRuntime } from "../demo-runtime.js"
import { resolveDocsFixtureSelection } from "../fixtures/docs-fixtures.js"

export default function DemoApp() {
  const selection = useMemo(() => resolveDocsFixtureSelection(), [])
  const runtime = useMemo(
    () =>
      createDocsDemoRuntime({
        tier: selection.tier,
        preset: selection.preset,
        source: selection.source,
      }),
    [selection],
  )

  return (
    <AppRoot
      workflowClient={runtime.workflowClient}
      rendererHost={runtime.rendererHost}
    />
  )
}
