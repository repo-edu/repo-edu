import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type {
  WorkflowClient,
  WorkflowId,
  WorkflowResult,
} from "@repo-edu/application-contract"
import {
  defaultAppSettings,
  type PersistedAppSettings,
} from "@repo-edu/domain/settings"
import {
  type PersistedCourse,
  persistedCourseKind,
} from "@repo-edu/domain/types"
import { SessionController } from "../session/session-controller.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { useUiStore } from "../stores/ui-store.js"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeCourse(id: string, displayName = id): PersistedCourse {
  return {
    kind: persistedCourseKind,
    backing: "lms",
    revision: 0,
    id,
    displayName,
    lmsConnectionId: null,
    organization: null,
    lmsCourseId: null,
    idSequences: {
      nextGroupSeq: 1,
      nextGroupSetSeq: 1,
      nextMemberSeq: 1,
      nextAssignmentSeq: 1,
      nextTeamSeq: 1,
    },
    roster: {
      connection: null,
      students: [],
      staff: [],
      groups: [],
      groupSets: [],
      assignments: [],
    },
    repositoryTemplate: null,
    searchFolder: null,
    analysisInputs: {},
    updatedAt: "2026-05-29T00:00:00.000Z",
  }
}

function makeSettings(
  overrides: Partial<PersistedAppSettings> = {},
): PersistedAppSettings {
  return { ...defaultAppSettings, ...overrides }
}

function workflowClient(
  run: (workflowId: WorkflowId, input: unknown) => Promise<unknown>,
): WorkflowClient {
  return {
    run: async (workflowId, input) =>
      (await run(workflowId, input)) as WorkflowResult<typeof workflowId>,
  } as WorkflowClient
}

async function waitForSnapshot(
  controller: SessionController,
  predicate: (
    snapshot: ReturnType<SessionController["getSnapshot"]>,
  ) => boolean,
): Promise<void> {
  if (predicate(controller.getSnapshot())) return
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(
        new Error(
          `Timed out waiting for controller snapshot: ${JSON.stringify(
            controller.getSnapshot(),
          )}`,
        ),
      )
    }, 1000)
    const unsubscribe = controller.subscribe(() => {
      if (!predicate(controller.getSnapshot())) return
      clearTimeout(timeout)
      unsubscribe()
      resolve()
    })
  })
}

beforeEach(() => {
  useAppSettingsStore.getState().reset()
  useCourseStore.getState().clear()
  useUiStore.getState().reset()
})

describe("SessionController", () => {
  it("bootstraps settings and hydrates the restored active course", async () => {
    const controller = new SessionController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
            activeTab: "groups-assignments",
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          assert.deepStrictEqual(input, { courseId: "course-a" })
          return makeCourse("course-a") as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "settings.saveApp") {
          return undefined as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })

    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )

    assert.equal(controller.getSnapshot().activeCourseId, "course-a")
    assert.equal(controller.getSnapshot().courseLoadStatus.state, "loaded")
    assert.equal(useCourseStore.getState().course?.id, "course-a")

    controller.dispose()
  })

  it("rejects stale activation completions", async () => {
    const courseALoad = deferred<PersistedCourse>()
    const controller = new SessionController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings() as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          return (
            courseId === "course-a" ? courseALoad.promise : makeCourse(courseId)
          ) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "settings.saveApp") {
          return undefined as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.save") {
          return {
            revision: 1,
            updatedAt: "2026-05-29T00:00:01.000Z",
          } as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )

    const first = controller.activateSurface({
      kind: "course",
      courseId: "course-a",
    })
    const second = controller.activateSurface({
      kind: "course",
      courseId: "course-b",
    })

    await second
    courseALoad.resolve(makeCourse("course-a"))
    await first

    assert.equal(controller.getSnapshot().activeCourseId, "course-b")
    assert.equal(useCourseStore.getState().course?.id, "course-b")

    controller.dispose()
  })

  it("rejects semantic mutations against the leaving course during enter", async () => {
    const courseBLoad = deferred<PersistedCourse>()
    const controller = new SessionController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          return (
            courseId === "course-b"
              ? courseBLoad.promise
              : makeCourse(courseId, "Original")
          ) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.save") {
          return {
            revision: 1,
            updatedAt: "2026-05-29T00:00:01.000Z",
          } as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "settings.saveApp") {
          return undefined as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )

    const transition = controller.activateSurface({
      kind: "course",
      courseId: "course-b",
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.pending?.kind === "enter",
    )

    controller.setDisplayName("Rejected")
    assert.equal(useCourseStore.getState().course?.displayName, "Original")

    courseBLoad.resolve(makeCourse("course-b"))
    await transition

    controller.dispose()
  })
})
