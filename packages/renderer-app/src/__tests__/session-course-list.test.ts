import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import type { CourseSummary, PersistedCourse } from "@repo-edu/domain/types"
import type { SessionController } from "../session/session-controller.js"
import { canAdmitSessionChange } from "../session/session-reducer.js"
import { useCourseStore } from "../stores/course-store.js"
import {
  activeCourseId,
  activeSurface,
  commandClient,
  commitPreparation,
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  testSessionStart,
  workflowClient,
} from "./session-controller.test-support.js"

const controllers: SessionController[] = []
beforeEach(resetStores)
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose()
})
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

describe("session course listing", () => {
  for (const change of [
    "create",
    "duplicate",
    "rename-active",
    "rename-inactive",
    "delete-active",
    "delete-inactive",
  ] as const) {
    for (const successor of ["command", "queued-command", "close"] as const) {
      it(`publishes the list and prunes recents within ${change} before ${successor}`, async () => {
        const courses = new Map([
          ["active", makeCourse("active")],
          ["inactive", makeCourse("inactive")],
        ])
        const summaries = (): CourseSummary[] =>
          [...courses.values()].map(
            ({ id, backing, displayName, updatedAt }) => ({
              id,
              backing,
              displayName,
              updatedAt,
            }),
          )
        const changing = deferred<void>()
        const changeRelease = deferred<void>()
        const listing = deferred<void>()
        const listRelease = deferred<void>()
        const order: string[] = []
        const assertPublished = () => {
          assert.deepEqual(controller.getSnapshot().courses, summaries())
          assert.deepEqual(
            controller.getSnapshot().settings.preferences
              .recentSubmissionFolders,
            [
              { path: "/active", courseId: "active" },
              { path: "/inactive", courseId: "inactive" },
            ].filter(({ courseId }) => courses.has(courseId)),
          )
          order.push(successor)
        }
        const workflow = workflowClient(async (id, input) => {
          if (id === "settings.loadApp")
            return makeSettings({
              activeSurface: { kind: "course", courseId: "active" },
              recentSubmissionFolders: [
                { path: "/active", courseId: "active" },
                { path: "/inactive", courseId: "inactive" },
                { path: "/missing", courseId: "missing" },
              ],
            })
          if (id === "course.load")
            return courses.get((input as { courseId: string }).courseId)
          if (id === "course.save" || id === "course.delete") {
            changing.resolve()
            await changeRelease.promise
            order.push("changed")
            if (id === "course.delete") {
              courses.delete((input as { courseId: string }).courseId)
              return
            }
            const course = input as PersistedCourse
            const stamp = { revision: 1, updatedAt: "2026-09-11T00:00:00Z" }
            courses.set(course.id, { ...course, ...stamp })
            return stamp
          }
          if (id === "course.list") {
            if (order.length === 0) return summaries()
            listing.resolve()
            await listRelease.promise
            return summaries()
          }
        })
        const controller = startController({
          workflowClient: workflow,
          commandClient: commandClient(workflow, {
            commit: async (preparation) => {
              assert.equal(preparation.course, undefined)
              assertPublished()
              return commitPreparation(preparation)
            },
          }),
        })
        controllers.push(controller)
        await controller.waitForIdle()
        const analysisRelease = deferred<void>()
        const analysis = controller.operations.execute(
          testSessionStart("analysisRun"),
          "analysis.run",
          async () => {
            await analysisRelease.promise
          },
        )
        await tick()
        const targetId = change.endsWith("-inactive") ? "inactive" : "active"
        const changingCourse =
          change === "create"
            ? controller.createCourse(testSessionStart("courseNew"), {
                backing: "lms",
                displayName: "New",
              })
            : change === "duplicate"
              ? controller.duplicateCourse(
                  testSessionStart("courseDuplicate"),
                  "inactive",
                  "Copy",
                )
              : change.startsWith("rename-")
                ? controller.renameCourse(
                    testSessionStart("courseRename"),
                    targetId,
                    "Renamed",
                  )
                : controller.deleteCourse(
                    testSessionStart("courseDelete"),
                    targetId,
                  )
        if (successor !== "queued-command") {
          analysisRelease.resolve()
          await changing.promise
        }
        const next =
          successor !== "close"
            ? controller.operations.execute(
                testSessionStart("archiveExport"),
                "examination.archive.export",
                (scope) =>
                  scope.run("examination.archive.export", {
                    kind: "user-save-target-ref",
                    referenceId: "target",
                    displayName: "archive.zip",
                    suggestedFormat: null,
                  }),
              )
            : controller.requestClose(async (preparation) => {
                assertPublished()
                return commitPreparation(preparation)
              })
        assert.equal(canAdmitSessionChange(controller.getSnapshot()), false)
        analysisRelease.resolve()
        changeRelease.resolve()
        await listing.promise
        assert.deepEqual(order, ["changed"])
        assert.equal(canAdmitSessionChange(controller.getSnapshot()), false)
        if (change === "rename-active") {
          assert.equal(useCourseStore.getState().course?.revision, 1)
          assert.equal(useCourseStore.getState().course?.displayName, "Renamed")
          assert.equal(
            controller.getSnapshot().courses[0]?.displayName,
            "active",
          )
        }
        listRelease.resolve()
        await Promise.all([analysis, changingCourse, next])
        assert.deepEqual(order, ["changed", successor])
      })
    }
  }

  for (const successor of ["command", "close"] as const) {
    it(`orders persistence, listing and surface follow-up before ${successor}`, async () => {
      const saved = deferred<void>()
      const saveRelease = deferred<void>()
      const listed = deferred<void>()
      const listRelease = deferred<CourseSummary[]>()
      const loading = deferred<void>()
      const loadRelease = deferred<void>()
      const order: string[] = []
      const controller = startController({
        workflowClient: workflowClient(async (id, input) => {
          if (id === "settings.loadApp")
            return makeSettings({
              activeSurface: { kind: "course", courseId: "old" },
            })
          if (id === "course.load") {
            const courseId = (input as { courseId: string }).courseId
            if (courseId === "new") {
              loading.resolve()
              await loadRelease.promise
            }
            return makeCourse(courseId)
          }
          if (id === "course.save") {
            saved.resolve()
            await saveRelease.promise
            order.push("saved")
            return { revision: 1, updatedAt: "2026-09-07T00:00:00Z" }
          }
          if (id === "course.list") {
            if (order.length === 0) return [makeCourse("old")]
            listed.resolve()
            return await listRelease.promise
          }
        }),
      })
      controllers.push(controller)
      await controller.waitForIdle()
      const refresh = controller.renameCourse(
        testSessionStart("courseRename"),
        "old",
        "Edited",
      )
      await saved.promise
      let listStarted = false
      void listed.promise.then(() => {
        listStarted = true
      })
      await tick()
      assert.equal(listStarted, false)
      const next =
        successor === "command"
          ? controller.operations.execute(
              testSessionStart("repositoryClone"),
              "repo.clone",
              async () => {
                assert.equal(useCourseStore.getState().course?.id, "new")
                order.push("command")
              },
            )
          : controller.requestClose(commitPreparation).then(() => {
              order.push("close")
            })
      saveRelease.resolve()
      await listed.promise
      assert.equal(useCourseStore.getState().course?.revision, 1)
      assert.equal(order.includes(successor), false)
      listRelease.resolve([
        {
          id: "new",
          backing: "lms",
          displayName: "New",
          updatedAt: "2026-09-07T00:00:00Z",
        },
      ])
      await loading.promise
      assert.equal(controller.getSnapshot().courses[0]?.id, "old")
      assert.equal(order.includes(successor), false)
      loadRelease.resolve()
      await Promise.all([refresh, next])
      assert.deepEqual(activeSurface(controller.getSnapshot()), {
        kind: "course",
        courseId: "new",
      })
      assert.equal(controller.getSnapshot().courses[0]?.id, "new")
      assert.deepEqual(order, ["saved", successor])
    })
  }

  it("lands a listing and the surface it redirects to in one notification", async () => {
    let listings = 0
    const controller = startController({
      workflowClient: workflowClient(async (id, input) => {
        if (id === "settings.loadApp")
          return makeSettings({
            activeSurface: { kind: "course", courseId: "a" },
          })
        if (id === "course.load")
          return makeCourse((input as { courseId: string }).courseId)
        if (id === "course.save")
          return { revision: 1, updatedAt: "2026-09-11T00:00:00Z" }
        if (id === "course.list")
          return ++listings === 1
            ? [makeCourse("a"), makeCourse("b")]
            : [makeCourse("b", "Renamed")]
        if (id === "settings.savePreferences") return
        assert.fail(id)
      }),
    })
    controllers.push(controller)
    await controller.waitForIdle()
    const notified: { courseIds: string[]; active: string | null }[] = []
    const unsubscribe = controller.subscribe(() => {
      const snapshot = controller.getSnapshot()
      notified.push({
        courseIds: snapshot.courses.map((course) => course.id),
        active: activeCourseId(snapshot),
      })
    })
    await controller.renameCourse(
      testSessionStart("courseRename"),
      "b",
      "Renamed",
    )
    unsubscribe()
    const landed = notified.findIndex(
      ({ courseIds }) => !courseIds.includes("a"),
    )
    assert.ok(landed > 0)
    assert.deepEqual(notified[landed - 1], {
      courseIds: ["a", "b"],
      active: "a",
    })
    assert.deepEqual(notified[landed], { courseIds: ["b"], active: "b" })
  })

  it("prunes submission recents in the admitted list body during command freeze", async () => {
    const entered = deferred<void>()
    const release = deferred<void>()
    const controller = startController({
      workflowClient: workflowClient(async (id) => {
        if (id === "settings.loadApp")
          return makeSettings({
            recentSubmissionFolders: [
              { path: "/submission", courseId: "missing" },
            ],
          })
        if (id === "course.list") {
          entered.resolve()
          await release.promise
          return []
        }
      }),
    })
    controllers.push(controller)
    await entered.promise
    const command = controller.operations.execute(
      testSessionStart("repositoryClone"),
      "repo.clone",
      async () => {
        assert.deepEqual(
          controller.getSnapshot().settings.preferences.recentSubmissionFolders,
          [],
        )
      },
    )
    release.resolve()
    await Promise.all([controller.waitForIdle(), command])
  })

  it("applies discovery follow-up without recursively reserving a surface turn", async () => {
    const controller = startController({
      workflowClient: workflowClient(async (id) => {
        if (id === "course.list")
          return [makeCourse("active"), makeCourse("inactive")]
        if (id === "settings.loadApp")
          return makeSettings({
            activeSurface: { kind: "folder", path: "/repo/subfolder" },
          })
      }),
    })
    controllers.push(controller)
    await controller.waitForIdle()
    const entered = deferred<void>()
    const release = deferred<void>()
    const discovery = controller.operations.execute(
      testSessionStart("analysisSearch"),
      "analysis.discoverRepos",
      async (scope) => {
        entered.resolve()
        await release.promise
        await scope.reconcileDiscovery(
          { kind: "folder", path: "/repo/subfolder" },
          "/repo/subfolder",
          {
            repos: [{ path: "/repo", name: "repo" }],
          } as never,
        )
      },
    )
    await entered.promise
    const command = controller.operations.execute(
      testSessionStart("repositoryClone"),
      "repo.clone",
      async () => {
        assert.deepEqual(activeSurface(controller.getSnapshot()), {
          kind: "folder",
          path: "/repo",
        })
      },
    )
    release.resolve()
    await Promise.all([discovery, command])
  })
})
