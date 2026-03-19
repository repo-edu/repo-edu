import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createConnectionWorkflowHandlers } from "../connection-workflows.js"
import { assertValidTimestamp } from "./helpers/assertions.js"

describe("application connection verification workflow helpers", () => {
  it("verifies LMS and Git drafts through adapter ports", async () => {
    let lmsDraft: unknown = null
    let lmsCourseDraft: unknown = null
    let gitDraft: unknown = null

    const handlers = createConnectionWorkflowHandlers({
      lms: {
        verifyConnection: async (draft) => {
          lmsDraft = draft
          return { verified: true }
        },
        listCourses: async (draft) => {
          lmsCourseDraft = draft
          return [
            { id: "course-1", name: "Course One", code: "C1" },
            { id: "course-2", name: "Course Two", code: null },
          ]
        },
      },
      git: {
        verifyConnection: async (draft) => {
          gitDraft = draft
          return { verified: false }
        },
      },
    })

    const lmsResult = await handlers["connection.verifyLmsDraft"]({
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
      userAgent: "Name / Organization / email@example.edu",
    })
    assert.equal(lmsResult.verified, true)
    assertValidTimestamp(lmsResult.checkedAt)
    assert.deepStrictEqual(lmsDraft, {
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
      userAgent: "Name / Organization / email@example.edu",
    })

    const courseResult = await handlers["connection.listLmsCoursesDraft"]({
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
      userAgent: "Name / Organization / email@example.edu",
    })
    assert.deepStrictEqual(courseResult, [
      { id: "course-1", name: "Course One", code: "C1" },
      { id: "course-2", name: "Course Two", code: null },
    ])
    assert.deepStrictEqual(lmsCourseDraft, {
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
      userAgent: "Name / Organization / email@example.edu",
    })

    const gitResult = await handlers["connection.verifyGitDraft"]({
      provider: "github",
      baseUrl: "https://github.com",
      token: "token-2",
    })
    assert.equal(gitResult.verified, false)
    assertValidTimestamp(gitResult.checkedAt)
    assert.deepStrictEqual(gitDraft, {
      provider: "github",
      baseUrl: "https://github.com",
      token: "token-2",
    })
  })

  it("normalizes provider failures and cancellation", async () => {
    const handlers = createConnectionWorkflowHandlers({
      lms: {
        verifyConnection: async () => {
          throw new Error("invalid token")
        },
        listCourses: async () => [],
      },
      git: {
        verifyConnection: async () => ({ verified: true }),
      },
    })

    await assert.rejects(
      handlers["connection.verifyLmsDraft"]({
        provider: "moodle",
        baseUrl: "https://moodle.example.edu",
        token: "bad-token",
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "provider" &&
        "provider" in error &&
        error.provider === "moodle",
    )

    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      handlers["connection.verifyGitDraft"](
        {
          provider: "gitlab",
          baseUrl: "https://gitlab.example.edu",
          token: "token",
        },
        { signal: controller.signal },
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "cancelled",
    )
  })
})
