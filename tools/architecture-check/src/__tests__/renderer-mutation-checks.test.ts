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
]) {
  it(`refuses an unowned renderer route: ${source}`, () => {
    assert.ok(checkRendererMutationSource(feature, source).length > 0)
  })
}

it("does not exempt newly added session helpers from raw client ownership", () => {
  assert.ok(
    checkRendererMutationSource(
      "packages/renderer-app/src/session/feature.ts",
      'import type { WorkflowClient } from "@repo-edu/application-contract"',
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
