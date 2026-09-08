import assert from "node:assert/strict"
import { it } from "node:test"
import type { PersistedCourse } from "@repo-edu/domain/types"
import {
  captureLmsPreview,
  type LmsPreviewEvent,
  type LmsPreviewResult,
  type LmsPreviewState,
  type LmsPreviewWorkflow,
  lmsPreviewReducer,
  requestLmsPreview,
} from "../session/lms-preview.js"
import { useCourseStore } from "../stores/course-store.js"
import {
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  waitForSnapshot,
  workflowClient,
} from "./session-controller.test-support.js"

const fetchedAt = "2026-09-08T12:00:00.000Z"
const workflows: LmsPreviewWorkflow[] = [
  "roster.importFromLms",
  "groupSet.connectFromLms",
  "groupSet.syncFromLms",
]

function previewResult(
  workflow: LmsPreviewWorkflow,
  course: PersistedCourse,
): LmsPreviewResult {
  const roster = structuredClone(course.roster)
  const idSequences = { ...course.idSequences, nextGroupSeq: 15 }
  if (workflow === "roster.importFromLms") {
    roster.connection = {
      kind: "canvas",
      courseId: "remote-course",
      lastUpdated: fetchedAt,
    }
    return {
      roster,
      idSequences,
      conflicts: [],
      totalConflicts: 0,
      summary: {
        membersAdded: 0,
        membersUpdated: 0,
        membersUnchanged: 0,
        membersMissingEmail: 0,
      },
    }
  }
  const groupSet = {
    id: "gs_0010",
    name: "Fetched groups",
    nameMode: "named" as const,
    groupIds: [],
    connection: {
      kind: "moodle" as const,
      courseId: "remote-course",
      groupingId: "remote-set",
      lastUpdated: fetchedAt,
    },
    repoNameTemplate: null,
    columnVisibility: {},
    columnSizing: {},
  }
  roster.groupSets = [groupSet]
  return { ...groupSet, roster, idSequences }
}

async function harness(workflow: LmsPreviewWorkflow) {
  resetStores()
  const course = makeCourse("course")
  course.lmsCourseId = "remote-course"
  const provider = deferred<LmsPreviewResult>()
  const started = deferred<PersistedCourse>()
  const saves: PersistedCourse[] = []
  const controller = startController({
    commandClient: {
      async runBody() {
        throw new Error("LMS previews must use ordinary calls")
      },
    },
    workflowClient: workflowClient(async (id, input) => {
      if (id === "settings.loadApp")
        return makeSettings({
          activeSurface: { kind: "course", courseId: course.id },
        })
      if (id === "course.load") return course
      if (id === workflow) {
        started.resolve((input as { course: PersistedCourse }).course)
        return provider.promise
      }
      if (id === "course.save") {
        const value = input as PersistedCourse
        saves.push(structuredClone(value))
        return {
          revision: value.revision + 1,
          updatedAt: "2026-09-08T13:00:00.000Z",
        }
      }
      throw new Error(`Unexpected workflow ${id}`)
    }),
  })
  await waitForSnapshot(
    controller,
    (state) => state.bootstrap.status === "ready",
  )
  const model: { state: LmsPreviewState } = { state: { status: "idle" } }
  const dispatch = (event: LmsPreviewEvent) => {
    model.state = lmsPreviewReducer(model.state, event)
  }
  const running = requestLmsPreview(
    controller,
    dispatch,
    workflow,
    course.id,
    "remote-set",
  )
  const captured = await started.promise
  return {
    controller,
    course,
    provider,
    saves,
    model,
    dispatch,
    running,
    captured,
  }
}

for (const workflow of workflows) {
  it(`${workflow} keeps preview transient then applies values and fetch date in one publication`, async () => {
    const h = await harness(workflow)
    try {
      const before = useCourseStore.getState()
      const result = previewResult(workflow, h.captured)
      h.provider.resolve(result)
      await h.running
      assert.equal(useCourseStore.getState().course, before.course)
      assert.equal(h.saves.length, 0)
      assert.equal(h.model.state.status, "ready")
      assert.ok(h.model.state.status === "ready")
      const { request } = h.model.state
      let publications = 0
      const unsubscribe = useCourseStore.subscribe((state) => {
        publications += 1
        assert.deepEqual(state.course?.roster, result.roster)
        assert.deepEqual(state.course?.idSequences, result.idSequences)
        assert.equal(state.admissionNumber, request.admissionNumber + 1)
      })
      assert.equal(
        h.controller.applyLmsPreview(
          h.course.id,
          request.admissionNumber,
          result,
        ),
        true,
      )
      unsubscribe()
      assert.equal(publications, 1)
      assert.equal(
        h.controller.applyLmsPreview(
          h.course.id,
          request.admissionNumber,
          result,
        ),
        false,
      )
      await h.controller.flush()
      assert.equal(h.saves.length, 1)
      assert.deepEqual(h.saves[0]?.roster, result.roster)
      assert.deepEqual(h.saves[0]?.idSequences, result.idSequences)
      assert.equal(
        useCourseStore.getState().admissionNumber,
        request.admissionNumber + 1,
      )
    } finally {
      h.controller.dispose()
    }
  })

  for (const when of ["pending", "ready"] as const) {
    it(`${workflow} refuses an edit while ${when} before any storage stamp`, async () => {
      const h = await harness(workflow)
      try {
        const result = previewResult(workflow, h.captured)
        if (when === "ready") {
          h.provider.resolve(result)
          await h.running
        }
        h.controller.setDisplayName(h.course.id, "Edited locally")
        const edited = useCourseStore.getState().course
        assert.equal(edited?.revision, h.course.revision)
        assert.notEqual(h.captured.displayName, edited?.displayName)
        assert.equal(h.saves.length, 0)
        if (when === "pending") {
          h.provider.resolve(result)
          await h.running
        }
        assert.ok(h.model.state.status === "ready")
        assert.equal(
          h.controller.applyLmsPreview(
            h.course.id,
            h.model.state.request.admissionNumber,
            result,
          ),
          false,
        )
        assert.equal(useCourseStore.getState().course, edited)
      } finally {
        h.controller.dispose()
      }
    })
  }

  if (workflow !== "roster.importFromLms") {
    it(`${workflow} refuses a pending result after editing, clearing and hydrating the same id`, async () => {
      const h = await harness(workflow)
      try {
        h.controller.setDisplayName(h.course.id, "Edited locally")
        useCourseStore.getState().clear()
        useCourseStore.getState().hydrate(structuredClone(h.course))
        const reloaded = useCourseStore.getState().course
        const result = previewResult(workflow, h.captured)
        h.provider.resolve(result)
        await h.running
        assert.ok(h.model.state.status === "ready")
        assert.equal(
          h.controller.applyLmsPreview(
            h.course.id,
            h.model.state.request.admissionNumber,
            result,
          ),
          false,
        )
        assert.equal(useCourseStore.getState().course, reloaded)
      } finally {
        h.controller.dispose()
      }
    })
  }
}

it("save stamps and view state preserve admission while hydrate, clear, edits and history advance it", () => {
  resetStores()
  const store = () => useCourseStore.getState()
  const course = makeCourse("course")
  store().hydrate(course)
  const initial = captureLmsPreview(course.id)
  store().applySaveStamp(course.id, { revision: 1, updatedAt: fetchedAt })
  store().setAssignmentSelection("assignment")
  store().runChecks("username")
  assert.equal(store().admissionNumber, initial.admissionNumber)
  assert.equal(
    store().applyLmsPreview(
      initial.admissionNumber,
      previewResult("roster.importFromLms", course),
    ),
    true,
  )
  for (const change of [
    () => store().setDisplayName("Renamed"),
    () =>
      store().setIdSequences({
        ...store().course!.idSequences,
        nextMemberSeq: 20,
      }),
    () => store().undo(),
    () => store().redo(),
    () =>
      store().applyCommittedCourse({
        ...store().course!,
        displayName: "Committed",
      }),
    () => store().hydrate(store().course!),
    () => store().clear(),
    () => store().clear(),
    () => store().hydrate(course),
  ]) {
    const before = store().admissionNumber
    change()
    assert.ok(store().admissionNumber > before)
  }
})

it("discarding or replacing a request prevents late preview publication", () => {
  useCourseStore.getState().hydrate(makeCourse("course"))
  const oldRequest = captureLmsPreview("course")
  const newRequest = captureLmsPreview("course")
  const result = previewResult("roster.importFromLms", oldRequest.course)
  const loading = lmsPreviewReducer(
    { status: "idle" },
    { type: "start", request: oldRequest },
  )
  const discarded = lmsPreviewReducer(loading, { type: "reset" })
  assert.equal(
    lmsPreviewReducer(discarded, {
      type: "ready",
      request: oldRequest,
      result,
    }),
    discarded,
  )
  const replaced = lmsPreviewReducer(loading, {
    type: "start",
    request: newRequest,
  })
  assert.equal(
    lmsPreviewReducer(replaced, {
      type: "failed",
      request: oldRequest,
      message: "Old failure",
    }),
    replaced,
  )
  assert.equal(
    lmsPreviewReducer(replaced, {
      type: "progress",
      request: oldRequest,
      message: "Old progress",
    }),
    replaced,
  )
})
