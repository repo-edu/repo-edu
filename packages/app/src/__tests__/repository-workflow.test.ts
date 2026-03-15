import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  PersistedAppSettings,
  PersistedCourse,
  RepositoryTemplate,
} from "@repo-edu/domain"
import {
  buildRepositoryWorkflowRequest,
  resolveRepositoryWorkflowId,
} from "../utils/repository-workflow.js"

const template: RepositoryTemplate = {
  owner: "repo-edu",
  name: "starter-template",
  visibility: "private",
}

const course: PersistedCourse = {
  kind: "repo-edu.course.v1",
  schemaVersion: 1,
  revision: 0,
  id: "course-1",
  displayName: "Course 1",
  lmsConnectionName: null,
  gitConnectionId: "git-main",
  organization: null,
  lmsCourseId: null,
  roster: {
    connection: null,
    students: [],
    staff: [],
    groups: [],
    groupSets: [],
    assignments: [],
  },
  repositoryTemplate: null,
  updatedAt: "2026-03-11T00:00:00.000Z",
}

const appSettings: PersistedAppSettings = {
  kind: "repo-edu.app-settings.v1",
  schemaVersion: 1,
  activeCourseId: course.id,
  appearance: {
    theme: "system",
    windowChrome: "system",
    dateFormat: "DMY",
    timeFormat: "24h",
  },
  lmsConnections: [],
  gitConnections: [],
  lastOpenedAt: null,
  rosterColumnVisibility: {},
  rosterColumnSizing: {},
  groupsHideIncomplete: false,
}

describe("repository workflow helpers", () => {
  it("maps each operation to the correct workflow id", () => {
    assert.equal(resolveRepositoryWorkflowId("create"), "repo.create")
    assert.equal(resolveRepositoryWorkflowId("clone"), "repo.clone")
    assert.equal(resolveRepositoryWorkflowId("delete"), "repo.delete")
  })

  it("builds create input without clone/delete-only fields", () => {
    const result = buildRepositoryWorkflowRequest({
      course,
      appSettings,
      assignmentId: "assignment-1",
      operation: "create",
      repositoryTemplate: template,
      targetDirectory: "/tmp/repos",
      directoryLayout: "flat",
    })

    assert.deepStrictEqual(result, {
      workflowId: "repo.create",
      input: {
        course,
        appSettings,
        assignmentId: "assignment-1",
        template,
      },
    })
  })

  it("builds clone input with directory options", () => {
    const result = buildRepositoryWorkflowRequest({
      course,
      appSettings,
      assignmentId: "assignment-1",
      operation: "clone",
      repositoryTemplate: template,
      targetDirectory: "/tmp/repos",
      directoryLayout: "by-team",
    })

    assert.deepStrictEqual(result, {
      workflowId: "repo.clone",
      input: {
        course,
        appSettings,
        assignmentId: "assignment-1",
        template,
        targetDirectory: "/tmp/repos",
        directoryLayout: "by-team",
      },
    })
  })

  it("builds delete input with explicit confirmation", () => {
    const result = buildRepositoryWorkflowRequest({
      course,
      appSettings,
      assignmentId: "assignment-1",
      operation: "delete",
      repositoryTemplate: template,
      targetDirectory: "/tmp/repos",
      directoryLayout: "flat",
    })

    assert.deepStrictEqual(result, {
      workflowId: "repo.delete",
      input: {
        course,
        appSettings,
        assignmentId: "assignment-1",
        template,
        confirmDelete: true,
      },
    })
  })
})
