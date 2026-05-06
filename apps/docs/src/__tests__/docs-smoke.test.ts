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

    const courses = await runtime.workflowClient.run("course.list", undefined)
    const courseIds = courses.map((course) => course.id).sort()
    assert.deepEqual(
      courseIds,
      [runtime.lmsCourseEntityId, runtime.repobeeCourseEntityId].sort(),
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
