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
import {
  createInitialSessionSnapshot,
  sessionReducer,
} from "../session/session-reducer.js"
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

// Mirrors RendererSessionRoot: construct, then start bootstrap explicitly.
function startController(
  options: ConstructorParameters<typeof SessionController>[0],
): SessionController {
  const controller = new SessionController(options)
  controller.start()
  return controller
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
    const controller = startController({
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

  it("recovers a missing persisted active course to home during bootstrap", async () => {
    const savedSettings: PersistedAppSettings[] = []
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: {
              kind: "course",
              courseId: "missing-course",
            },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          assert.deepStrictEqual(input, { courseId: "missing-course" })
          throw {
            type: "not-found",
            message: "Course was removed.",
            resource: "course",
          }
        }
        if (workflowId === "settings.saveApp") {
          savedSettings.push(input as PersistedAppSettings)
          return undefined as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })

    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.bootstrap.status === "ready",
    )
    await controller.flush()

    assert.deepStrictEqual(controller.getSnapshot().activeSurface, {
      kind: "home",
    })
    assert.equal(controller.getSnapshot().activeCourseId, null)
    assert.equal(useCourseStore.getState().course, null)
    assert.deepStrictEqual(savedSettings.at(-1)?.activeSurface, {
      kind: "home",
    })

    controller.dispose()
  })

  it("normalizes loaded roster courses without mutating workflow results", async () => {
    const loadedCourse = makeCourse("course-a")
    const controller = startController({
      workflowClient: workflowClient(async (workflowId) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          return loadedCourse as WorkflowResult<typeof workflowId>
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

    const hydratedCourse = useCourseStore.getState().course
    assert.notEqual(hydratedCourse, loadedCourse)
    assert.equal(loadedCourse.roster.groupSets.length, 0)
    assert.equal(loadedCourse.idSequences.nextGroupSetSeq, 1)
    assert.equal(hydratedCourse?.roster.groupSets.length, 2)
    assert.equal(hydratedCourse?.idSequences.nextGroupSetSeq, 3)

    controller.dispose()
  })

  it("waits for pending activation before close flush persists settings", async () => {
    const courseALoad = deferred<PersistedCourse>()
    const savedSettings: PersistedAppSettings[] = []
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings() as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          assert.deepStrictEqual(input, { courseId: "course-a" })
          return (await courseALoad.promise) as WorkflowResult<
            typeof workflowId
          >
        }
        if (workflowId === "settings.saveApp") {
          savedSettings.push(input as PersistedAppSettings)
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
      courseId: "course-a",
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.pending?.kind === "enter",
    )

    const closeFlush = controller.flush()
    assert.equal(
      await Promise.race([
        closeFlush.then(() => "flushed" as const),
        new Promise<"pending">((resolve) =>
          setTimeout(() => resolve("pending"), 20),
        ),
      ]),
      "pending",
    )

    courseALoad.resolve(makeCourse("course-a"))
    await transition
    await closeFlush

    assert.equal(controller.getSnapshot().activeCourseId, "course-a")
    assert.deepStrictEqual(savedSettings.at(-1)?.activeSurface, {
      kind: "course",
      courseId: "course-a",
    })

    controller.dispose()
  })

  it("serializes overlapping activations before committing the last request", async () => {
    const courseALoad = deferred<PersistedCourse>()
    let courseBLoadCount = 0
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings() as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          if (courseId === "course-a") {
            return (await courseALoad.promise) as WorkflowResult<
              typeof workflowId
            >
          }
          courseBLoadCount += 1
          return makeCourse(courseId) as WorkflowResult<typeof workflowId>
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

    assert.equal(
      await Promise.race([
        second.then(() => "activated" as const),
        new Promise<"pending">((resolve) =>
          setTimeout(() => resolve("pending"), 20),
        ),
      ]),
      "pending",
    )
    assert.equal(courseBLoadCount, 0)

    courseALoad.resolve(makeCourse("course-a"))
    await first
    await second

    assert.equal(courseBLoadCount, 1)
    assert.equal(controller.getSnapshot().activeCourseId, "course-b")
    assert.equal(useCourseStore.getState().course?.id, "course-b")

    controller.dispose()
  })

  it("keeps the committed course when target hydration normalization fails", async () => {
    const malformedCourse = {
      ...makeCourse("course-b"),
      roster: undefined,
    } as unknown as PersistedCourse
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          return (
            courseId === "course-b" ? malformedCourse : makeCourse(courseId)
          ) as WorkflowResult<typeof workflowId>
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

    assert.equal(
      await controller.activateSurface({
        kind: "course",
        courseId: "course-b",
      }),
      false,
    )

    assert.equal(controller.getSnapshot().activeCourseId, "course-a")
    assert.equal(useCourseStore.getState().course?.id, "course-a")

    controller.dispose()
  })

  it("rejects semantic mutations against the leaving course during enter", async () => {
    const courseBLoad = deferred<PersistedCourse>()
    const controller = startController({
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

    controller.setDisplayName("course-a", "Rejected")
    assert.equal(useCourseStore.getState().course?.displayName, "Original")

    courseBLoad.resolve(makeCourse("course-b"))
    await transition

    controller.dispose()
  })

  it("commits home after active delete when fallback course loading fails", async () => {
    useUiStore.getState().setCourseList([
      {
        id: "course-a",
        backing: "lms",
        displayName: "Course A",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
      {
        id: "course-b",
        backing: "lms",
        displayName: "Course B",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    ])
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          if (courseId === "course-b") {
            throw new Error("fallback unavailable")
          }
          return makeCourse(courseId) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.delete") {
          assert.deepStrictEqual(input, { courseId: "course-a" })
          return undefined as WorkflowResult<typeof workflowId>
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

    await controller.deleteCourse("course-a")

    assert.deepStrictEqual(controller.getSnapshot().activeSurface, {
      kind: "home",
    })
    assert.equal(controller.getSnapshot().activeCourseId, null)
    assert.equal(useCourseStore.getState().course, null)

    controller.dispose()
  })

  it("keeps an active delete pending until fallback commit before later activation", async () => {
    useUiStore.getState().setCourseList([
      {
        id: "course-a",
        backing: "lms",
        displayName: "Course A",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
      {
        id: "course-b",
        backing: "lms",
        displayName: "Course B",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    ])
    const deleteGate = deferred<void>()
    let courseBLoadCount = 0
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          if (courseId === "course-b") {
            courseBLoadCount += 1
          }
          return makeCourse(courseId) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.delete") {
          assert.deepStrictEqual(input, { courseId: "course-a" })
          await deleteGate.promise
          return undefined as WorkflowResult<typeof workflowId>
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

    const deleting = controller.deleteCourse("course-a")
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.pending?.kind === "delete",
    )
    const activating = controller.activateSurface({
      kind: "course",
      courseId: "course-b",
    })

    assert.equal(
      await Promise.race([
        activating.then(() => "activated" as const),
        new Promise<"pending">((resolve) =>
          setTimeout(() => resolve("pending"), 20),
        ),
      ]),
      "pending",
    )
    assert.equal(courseBLoadCount, 0)
    assert.equal(controller.getSnapshot().pending?.kind, "delete")

    deleteGate.resolve()
    await deleting
    await activating

    assert.equal(courseBLoadCount, 1)
    assert.equal(controller.getSnapshot().activeCourseId, "course-b")
    assert.equal(useCourseStore.getState().course?.id, "course-b")

    controller.dispose()
  })

  it("queues an active-course rename behind a pending enter", async () => {
    const courseBLoad = deferred<PersistedCourse>()
    const savedDrafts: PersistedCourse[] = []
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          if (courseId === "course-b") {
            return (await courseBLoad.promise) as WorkflowResult<
              typeof workflowId
            >
          }
          return makeCourse(courseId, "Original A") as WorkflowResult<
            typeof workflowId
          >
        }
        if (workflowId === "course.save") {
          savedDrafts.push(input as PersistedCourse)
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

    const renamed = controller.renameCourse("course-a", "Renamed A")
    courseBLoad.resolve(makeCourse("course-b"))
    await transition
    await renamed

    const renameSave = savedDrafts.find((draft) => draft.id === "course-a")
    assert.equal(renameSave?.displayName, "Renamed A")

    controller.dispose()
  })

  it("activates a newly created course without re-loading it", async () => {
    const courseLoadCalls: string[] = []
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings() as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          courseLoadCalls.push(courseId)
          return makeCourse(courseId) as WorkflowResult<typeof workflowId>
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

    const draft = await controller.createCourse({
      backing: "lms",
      displayName: "New Course",
      lmsConnectionId: null,
      lmsCourseId: null,
    })

    assert.equal(courseLoadCalls.includes(draft.id), false)
    assert.equal(controller.getSnapshot().activeCourseId, draft.id)
    assert.equal(useCourseStore.getState().course?.id, draft.id)
    assert.equal(useCourseStore.getState().course?.revision, 1)

    controller.dispose()
  })

  it("admits target-aware course mutations only for the active course", async () => {
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          return makeCourse(courseId) as WorkflowResult<typeof workflowId>
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

    const baselineRoster = useCourseStore.getState().course?.roster
    assert.ok(baselineRoster)
    const bumped = { ...makeCourse("x").idSequences, nextMemberSeq: 99 }

    let staleFollowUpRan = false
    controller.mutateCourse("course-b", (actions) => {
      actions.setRoster(baselineRoster, "Import students from file")
      actions.setIdSequences(bumped)
      staleFollowUpRan = true
    })
    assert.equal(staleFollowUpRan, false)
    assert.notDeepStrictEqual(
      useCourseStore.getState().course?.idSequences,
      bumped,
    )

    let admittedFollowUpRan = false
    controller.mutateCourse("course-a", (actions) => {
      actions.setRoster(baselineRoster, "Import students from file")
      actions.setIdSequences(bumped)
      admittedFollowUpRan = true
    })
    assert.equal(admittedFollowUpRan, true)
    assert.deepStrictEqual(
      useCourseStore.getState().course?.idSequences,
      bumped,
    )

    controller.dispose()
  })

  it("drops course mutations after controller disposal", async () => {
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          const { courseId } = input as { courseId: string }
          return makeCourse(courseId, "Original") as WorkflowResult<
            typeof workflowId
          >
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

    controller.dispose()
    let callbackRan = false
    controller.mutateCourse("course-a", (actions) => {
      actions.setDisplayName("Rejected")
      callbackRan = true
    })
    controller.setDisplayName("course-a", "Rejected")

    assert.equal(callbackRan, false)
    assert.equal(useCourseStore.getState().course?.displayName, "Original")
  })

  it("does not hydrate the course store when load resolves after dispose", async () => {
    const courseLoad = deferred<PersistedCourse>()
    const controller = startController({
      workflowClient: workflowClient(async (workflowId, input) => {
        if (workflowId === "settings.loadApp") {
          return makeSettings({
            activeSurface: { kind: "course", courseId: "course-a" },
          }) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "course.load") {
          assert.deepStrictEqual(input, { courseId: "course-a" })
          return (await courseLoad.promise) as WorkflowResult<typeof workflowId>
        }
        if (workflowId === "settings.saveApp") {
          return undefined as WorkflowResult<typeof workflowId>
        }
        throw new Error(`Unexpected workflow ${workflowId}`)
      }),
    })
    await waitForSnapshot(
      controller,
      (snapshot) => snapshot.courseLoadStatus.state === "loading",
    )

    controller.dispose()
    courseLoad.resolve(makeCourse("course-a"))
    await controller.waitForIdle()

    assert.equal(useCourseStore.getState().course, null)
    assert.equal(controller.getSnapshot().activeCourseId, null)
  })

  it("treats disposal as terminal in the session reducer", () => {
    const disposed = sessionReducer(createInitialSessionSnapshot(), {
      type: "dispose",
    })
    assert.equal(disposed.disposed, true)

    // A queued transition that resolved past dispose must not re-arm pending.
    const reArmed = sessionReducer(disposed, {
      type: "enter-start",
      requestId: 1,
      targetSurface: { kind: "course", courseId: "course-b" },
      leavingCourseId: null,
    })
    assert.equal(reArmed, disposed)
    assert.equal(reArmed.pending, null)
  })
})
