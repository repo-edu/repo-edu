import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isAppError } from "@repo-edu/application-contract"
import { createBlankCourse } from "@repo-edu/domain/types"
import { fixturePresets, getFixture } from "@repo-edu/test-fixtures"
import {
  type CourseRow,
  decodeCourseRow,
  encodeCoursePayload,
} from "../codec.js"

const course = createBlankCourse("course-1", "2026-09-06T10:00:00Z", {
  backing: "lms",
  displayName: 'Résumé "A"\n第二課',
  lmsConnectionId: "connection-1",
  lmsCourseId: "lms-1",
  organization: "School",
  repositoryCloneTargetDirectory: "repos",
  repositoryCloneDirectoryLayout: "by-team",
  searchFolder: "analysis",
  analysisInputs: { extensions: ["ts", "py"] },
})

function row(overrides: Partial<CourseRow> = {}): CourseRow {
  return {
    id: course.id,
    revision: 1,
    updated_at: course.updatedAt,
    payload: encodeCoursePayload(course),
    ...overrides,
  }
}

function isTerminalFailure(error: unknown): boolean {
  return isAppError(error) && error.type === "course-storage"
}

describe("course row codec", () => {
  for (const preset of fixturePresets) {
    it(`round-trips the populated ${preset} course`, () => {
      const successor = getFixture({ tier: "small", preset }).course
      assert.deepEqual(
        decodeCourseRow({
          id: successor.id,
          revision: 1,
          updated_at: successor.updatedAt,
          payload: encodeCoursePayload(successor),
        }),
        { ...successor, revision: 1 },
      )
    })
  }

  it("round-trips all payload fields without changing the successor", () => {
    const before = structuredClone(course)
    const payload = JSON.parse(encodeCoursePayload(course))
    assert.equal("id" in payload, false)
    assert.equal("revision" in payload, false)
    assert.equal("updatedAt" in payload, false)
    assert.deepEqual(decodeCourseRow(row()), { ...course, revision: 1 })
    assert.deepEqual(course, before)
  })

  it("uses the row columns as the sole identity and save stamp", () => {
    assert.deepEqual(
      decodeCourseRow(
        row({
          id: "course-2",
          revision: 9,
          updated_at: "2026-09-07T10:00:00Z",
        }),
      ),
      {
        ...course,
        id: "course-2",
        revision: 9,
        updatedAt: "2026-09-07T10:00:00Z",
      },
    )
  })

  it("rejects duplicated row-owned fields even when they agree", () => {
    for (const fields of [
      { id: course.id },
      { revision: 1 },
      { updatedAt: course.updatedAt },
    ]) {
      const payload = JSON.stringify({
        ...JSON.parse(encodeCoursePayload(course)),
        ...fields,
      })
      assert.throws(() => decodeCourseRow(row({ payload })), isTerminalFailure)
    }
  })

  it("rejects malformed JSON and invalid stored course content", () => {
    for (const payload of [
      "{",
      "null",
      "[]",
      "1",
      '"course"',
      "{}",
      JSON.stringify({
        ...JSON.parse(encodeCoursePayload(course)),
        backing: "repobee",
      }),
    ]) {
      assert.throws(() => decodeCourseRow(row({ payload })), isTerminalFailure)
    }
  })

  it("validates complete successors before encoding", () => {
    assert.throws(
      () => encodeCoursePayload({ ...course, revision: -1 }),
      isTerminalFailure,
    )
    assert.throws(
      () => encodeCoursePayload({ ...course, backing: "repobee" }),
      isTerminalFailure,
    )
  })
})
