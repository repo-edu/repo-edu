import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import type { CourseSummary, PersistedCourse } from "@repo-edu/domain/types"
import type { SessionController } from "../session/session-controller.js"
import { canAdmitSessionChange } from "../session/session-reducer.js"
import { useCourseStore } from "../stores/course-store.js"
import { useUiStore } from "../stores/ui-store.js"
import {
  activeSurface,
  commitPreparation,
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
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
        useUiStore.getState().setCourseList(summaries())
        const controller = startController({
          workflowClient: workflowClient(async (id, input) => {
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
              listing.resolve()
              await listRelease.promise
              return summaries()
            }
          }),
        })
        controllers.push(controller)
        await controller.waitForIdle()
        const analysisRelease = deferred<void>()
        const analysis = controller.operations.execute(
          "analysis.run",
          async () => {
            await analysisRelease.promise
          },
        )
        await tick()
        const targetId = change.endsWith("-inactive") ? "inactive" : "active"
        const changingCourse =
          change === "create"
            ? controller.createCourse({ backing: "lms", displayName: "New" })
            : change === "duplicate"
              ? controller.duplicateCourse("inactive", "Copy")
              : change.startsWith("rename-")
                ? controller.renameCourse(targetId, "Renamed")
                : controller.deleteCourse(targetId)
        if (successor !== "queued-command") {
          analysisRelease.resolve()
          await changing.promise
        }
        const assertPublished = () => {
          assert.deepEqual(useUiStore.getState().courseList, summaries())
          assert.equal(useUiStore.getState().courseListLoading, false)
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
        const next =
          successor !== "close"
            ? controller.operations.execute(
                "roster.exportMembers",
                async (scope) => {
                  await scope.preparePersistence(async (preparation) => {
                    assert.equal(preparation.course, undefined)
                    return commitPreparation(preparation)
                  })
                  assertPublished()
                },
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
        assert.equal(useUiStore.getState().courseListLoading, true)
        if (change === "rename-active") {
          assert.equal(useCourseStore.getState().course?.revision, 1)
          assert.equal(useCourseStore.getState().course?.displayName, "Renamed")
          assert.equal(
            useUiStore.getState().courseList[0]?.displayName,
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
            listed.resolve()
            return await listRelease.promise
          }
        }),
      })
      controllers.push(controller)
      await controller.waitForIdle()
      controller.setDisplayName("old", "Edited")
      const refresh = controller.refreshCourses()
      await saved.promise
      let listStarted = false
      void listed.promise.then(() => {
        listStarted = true
      })
      await tick()
      assert.equal(listStarted, false)
      const next =
        successor === "command"
          ? controller.operations.execute("repo.clone", async () => {
              assert.equal(useCourseStore.getState().course?.id, "new")
              order.push("command")
            })
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
      assert.equal(useUiStore.getState().courseList[0]?.id, "new")
      assert.equal(order.includes(successor), false)
      loadRelease.resolve()
      await Promise.all([refresh, next])
      assert.deepEqual(activeSurface(controller.getSnapshot()), {
        kind: "course",
        courseId: "new",
      })
      assert.equal(useUiStore.getState().courseListLoading, false)
      assert.deepEqual(order, ["saved", successor])
    })
  }

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
    await controller.waitForIdle()
    const refresh = controller.refreshCourses()
    await entered.promise
    const command = controller.operations.execute("repo.clone", async () => {
      assert.deepEqual(
        controller.getSnapshot().settings.preferences.recentSubmissionFolders,
        [],
      )
    })
    release.resolve()
    await Promise.all([refresh, command])
  })

  it("applies discovery follow-up without recursively reserving a surface turn", async () => {
    const controller = startController({
      workflowClient: workflowClient(async (id) => {
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
    const command = controller.operations.execute("repo.clone", async () => {
      assert.deepEqual(activeSurface(controller.getSnapshot()), {
        kind: "folder",
        path: "/repo",
      })
    })
    release.resolve()
    await Promise.all([discovery, command])
  })
})
