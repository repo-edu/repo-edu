import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mountDocsDemoApp } from "../demo-runtime.js"

describe("docs demo smoke", () => {
  it("mounts AppRoot against browser-safe mocks", async () => {
    const fakeMountNode = { id: "app" }
    const fakeAppRoot = () => null
    let renderedElement: unknown = null

    const runtime = mountDocsDemoApp({
      queryMountNode: () => fakeMountNode,
      appRootComponent: fakeAppRoot,
      createRoot(node) {
        assert.equal(node, fakeMountNode)
        return {
          render(element) {
            renderedElement = element
          },
        }
      },
    })

    assert.notEqual(renderedElement, null)
    assert.equal(runtime.fixtureSelection.tier, "medium")
    assert.equal(runtime.fixtureSelection.preset, "shared-teams")
    assert.equal(runtime.fixtureSelection.source, "canvas")

    const profiles = await runtime.workflowClient.run("profile.list", undefined)
    assert.equal(
      profiles.some((profile) => profile.id === runtime.seedProfileId),
      true,
    )

    const environment = await runtime.rendererHost.getEnvironmentSnapshot()
    assert.equal(environment.shell, "browser-mock")
  })

  it("throws when the #app mount node is missing", () => {
    assert.throws(
      () =>
        mountDocsDemoApp({
          queryMountNode: () => null,
          appRootComponent: () => null,
        }),
      /mount node #app/,
    )
  })
})
