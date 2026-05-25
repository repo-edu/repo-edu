import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  createWorkflowClient,
  type WorkflowClient,
} from "@repo-edu/application-contract"
import {
  type PersistedCourse,
  persistedCourseKind,
} from "@repo-edu/domain/types"
import {
  clearWorkflowClient,
  setWorkflowClient,
} from "../contexts/workflow-client.js"
import { useCourseStore } from "../stores/course-store.js"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function makeCourse(id: string): PersistedCourse {
  return {
    kind: persistedCourseKind,
    backing: "lms",
    revision: 0,
    id,
    displayName: id,
    lmsConnectionName: null,
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
    updatedAt: "2026-03-11T00:00:00.000Z",
  }
}

beforeEach(() => {
  clearWorkflowClient()
  useCourseStore.getState().clear()
})

describe("course store lifecycle", () => {
  it("ignores stale course load completions after a newer load wins", async () => {
    const slowLoad = deferred<PersistedCourse>()
    const fastLoad = deferred<PersistedCourse>()
    const client = createWorkflowClient({
      "course.load": async (input) =>
        input.courseId === "course-a" ? slowLoad.promise : fastLoad.promise,
    })
    setWorkflowClient(client as unknown as WorkflowClient)

    const firstLoad = useCourseStore.getState().load("course-a")
    const secondLoad = useCourseStore.getState().load("course-b")

    fastLoad.resolve(makeCourse("course-b"))
    await secondLoad
    assert.equal(useCourseStore.getState().course?.id, "course-b")

    slowLoad.resolve(makeCourse("course-a"))
    await firstLoad
    assert.equal(useCourseStore.getState().course?.id, "course-b")
  })
})
