import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createValidationAppError,
  runValidateAssignmentForCourse,
  runValidateRosterForCourse,
} from "../core.js"
import { createValidationWorkflowHandlers } from "../validation-workflows.js"
import {
  makeCourseWithKnownValidationIssues,
  makeInvalidCourseWrongKind,
} from "./helpers/test-builders.js"

describe("application validation helpers", () => {
  it("validates roster issues from a persisted course", () => {
    const result = runValidateRosterForCourse(
      makeCourseWithKnownValidationIssues(),
    )

    assert.equal(
      result.issues.some((issue) => issue.kind === "system_group_sets_missing"),
      true,
    )
    assert.equal(
      result.issues.some((issue) => issue.kind === "missing_email"),
      true,
    )
  })

  it("validates assignment issues from a persisted course", () => {
    const result = runValidateAssignmentForCourse(
      makeCourseWithKnownValidationIssues(),
      "a1",
    )

    assert.equal(
      result.issues.some((issue) => issue.kind === "empty_group"),
      true,
    )
    assert.equal(
      result.issues.some((issue) => issue.kind === "missing_git_username"),
      true,
    )
  })

  it("normalizes validation issues into an AppError", () => {
    const issues = runValidateRosterForCourse(
      makeCourseWithKnownValidationIssues(),
    ).issues
    const error = createValidationAppError("Validation failed.", issues)

    assert.deepStrictEqual(error, {
      type: "validation",
      message: "Validation failed.",
      issues,
    })
  })

  it("validates using explicit course snapshots", async () => {
    const course = makeCourseWithKnownValidationIssues()
    const handlers = createValidationWorkflowHandlers()

    const rosterResult = await handlers["validation.roster"]({
      course,
    })
    const assignmentResult = await handlers["validation.assignment"]({
      course,
      assignmentId: "a1",
    })

    assert.equal(rosterResult.issues.length > 0, true)
    assert.equal(
      assignmentResult.issues.some((issue) => issue.kind === "empty_group"),
      true,
    )
  })

  it("returns validation error for invalid course snapshots", async () => {
    const handlers = createValidationWorkflowHandlers()

    await assert.rejects(
      handlers["validation.roster"]({
        course: makeInvalidCourseWrongKind(
          makeCourseWithKnownValidationIssues(),
        ),
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })
})
