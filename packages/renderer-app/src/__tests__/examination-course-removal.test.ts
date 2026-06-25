import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  buildSourceSessionKey,
  type SourceIdentity,
} from "../components/tabs/examination/source.js"
import { publishCourseRemoval } from "../session/source-lifecycle-events.js"
import { useExaminationStore } from "../stores/examination-store.js"

const repositoryIdentity: SourceIdentity = {
  kind: "repository-analysis",
  repoPath: "/repo",
  commitOid: "a".repeat(40),
  subjectId: "p_1",
  excerptScopeId: "scope-1",
  redactionIdentityScopeId: "redaction-1",
  questionCount: 4,
  model: "22",
  effort: "medium",
}

const submissionIdentity: SourceIdentity = {
  kind: "submission",
  folderPath: "/submission",
  contentScopeId: "submission-scope",
  subjectId: "submission",
  excerptScopeId: "submission-scope",
  redactionIdentityScopeId: "redaction-1",
  questionCount: 4,
  model: "22",
  effort: "medium",
}

beforeEach(() => {
  useExaminationStore.getState().reset()
})

describe("course removal lifecycle", () => {
  it("removes examination sessions scoped to the deleted course", () => {
    const store = useExaminationStore.getState()
    const courseAKey = { kind: "course" as const, courseId: "course-a" }
    const courseBKey = { kind: "course" as const, courseId: "course-b" }
    const submissionAKey = {
      kind: "submission" as const,
      path: "/submission-a",
      courseId: "course-a",
    }
    const repositoryASessionKey = buildSourceSessionKey(
      repositoryIdentity,
      courseAKey,
    )
    const repositoryBSessionKey = buildSourceSessionKey(
      repositoryIdentity,
      courseBKey,
    )
    const submissionASessionKey = buildSourceSessionKey(
      submissionIdentity,
      submissionAKey,
    )

    for (const [sourceSessionKey, sourceIdentity] of [
      [repositoryASessionKey, repositoryIdentity],
      [repositoryBSessionKey, repositoryIdentity],
      [submissionASessionKey, submissionIdentity],
    ] as const) {
      store.activateSource({
        sourceSummaryKey: `${sourceSessionKey}-summary`,
        sourceSessionKey,
        sourceIdentity,
        subjectIds: ["p_1"],
        selectedSubjectId: "p_1",
        defaultPreferences: {
          questionCount: 4,
          activeConnectionId: "llm-1",
          modelCode: "22",
          effort: "medium",
        },
      })
    }

    publishCourseRemoval("course-a")

    const state = useExaminationStore.getState()
    assert.equal(state.sourceSessions.has(repositoryASessionKey), false)
    assert.equal(state.sourceSessions.has(submissionASessionKey), false)
    assert.equal(state.sourceSessions.has(repositoryBSessionKey), true)
  })
})
