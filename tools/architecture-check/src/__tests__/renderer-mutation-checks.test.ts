import assert from "node:assert/strict"
import { it } from "node:test"
import { checkRendererMutationSource } from "../renderer-mutation-checks.js"

const feature = "packages/renderer-app/src/components/Feature.tsx"
for (const source of [
  'host.pickDirectory({ title: "folder" }).then(setFolder)',
  'const choose = host["pickUserFile"]',
  "const { pickSaveTarget: choose } = host",
  "useCourseStore.setState({ course })",
  'const write = useCourseStore["setState"]',
  'type Client = import("@repo-edu/application-contract").WorkflowClient',
  'import * as Contract from "@repo-edu/application-contract"; let client: Contract.WorkflowClient',
  'import type { WorkflowClient as Raw } from "@repo-edu/application-contract"',
  'import { createWorkflowClient as create } from "@repo-edu/application-contract"',
  "const client = operations.controllerClient",
  'window.addEventListener("paste", changeCourse)',
  "window.addEventListener(event, changeCourse)",
  'scope.signal.addEventListener("keydown", changeCourse)',
  "window.signal.addEventListener(event, changeCourse)",
]) {
  it(`refuses an unowned renderer route: ${source}`, () => {
    assert.ok(checkRendererMutationSource(feature, source).length > 0)
  })
}

it("permits a reservation's own stop listener", () => {
  assert.deepEqual(
    checkRendererMutationSource(
      feature,
      'scope.signal.addEventListener("abort", revert, { once: true })',
    ),
    [],
  )
})

for (const event of ["keydown", "keyup"]) {
  it(`permits ${event} at the session input owner only`, () => {
    const source = `window.addEventListener("${event}", admitKeyboardInput, true)`
    assert.deepEqual(
      checkRendererMutationSource(
        "packages/renderer-app/src/session/session-controller-context.tsx",
        source,
      ),
      [],
    )
    assert.ok(checkRendererMutationSource(feature, source).length > 0)
  })
}

it("refuses an unlisted native event at the session input owner", () => {
  assert.ok(
    checkRendererMutationSource(
      "packages/renderer-app/src/session/session-controller-context.tsx",
      'window.addEventListener("paste", changeCourse)',
    ).length > 0,
  )
})

it("does not exempt newly added session helpers from raw client ownership", () => {
  assert.ok(
    checkRendererMutationSource(
      "packages/renderer-app/src/session/feature.ts",
      'import type { WorkflowClient } from "@repo-edu/application-contract"',
    ).length > 0,
  )
})

const app = "packages/renderer-app/src/components/App.tsx"
const appRoot = (use: string) => `
  import type { WorkflowClient } from "@repo-edu/application-contract"
  import { useLayoutEffect } from "react"
  import { SessionController } from "../session/session-controller.js"
  type Props = { workflowClient: WorkflowClient }
  function RendererSessionRoot({ workflowClient }: Props) {
    useLayoutEffect(() => {
      const controller = new SessionController({ workflowClient })
      ${use}
      return () => controller.dispose()
    }, [workflowClient])
  }
`

it("permits the App client only for controller construction and its effect dependency", () => {
  assert.deepEqual(checkRendererMutationSource(app, appRoot("")), [])
})

for (const use of [
  'workflowClient.run("analysis.run", input)',
  "const alias = workflowClient",
  "publish(workflowClient)",
  "void workflowClient.run",
]) {
  it(`rejects an App raw-client use: ${use}`, () => {
    assert.ok(checkRendererMutationSource(app, appRoot(use)).length > 0)
  })
}

it("rejects raw-client creation in App", () => {
  assert.ok(
    checkRendererMutationSource(
      app,
      'import { createWorkflowClient } from "@repo-edu/application-contract"',
    ).length > 0,
  )
})

it("permits the picker and its publication inside one session body", () => {
  assert.deepEqual(
    checkRendererMutationSource(
      feature,
      `
    client.execute("pickDirectory", async scope => {
      const path = await scope.direct("pickDirectory", () => host.pickDirectory())
      scope.publish(() => setFolder(path))
    })
  `,
    ),
    [],
  )
})

it("rejects a different action disguised as a picker body", () => {
  assert.ok(
    checkRendererMutationSource(
      feature,
      `
    scope.direct("pickSaveTarget", () => host.pickDirectory())
  `,
    ).length > 0,
  )
})
