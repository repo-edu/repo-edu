import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import type {
  PersistedCourse,
  RepositoryTemplate,
} from "@repo-edu/domain/types"
import {
  buildRepositoryWorkflowRequest,
  resolveRepositoryWorkflowId,
} from "../utils/repository-workflow.js"

const template: RepositoryTemplate = {
  kind: "remote",
  owner: "repo-edu",
  name: "starter-template",
  visibility: "private",
}

const course: PersistedCourse = {
  kind: "repo-edu.course.v1",
  revision: 0,
  id: "course-1",
  displayName: "Course 1",
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

const appSettings: PersistedAppSettings = {
  kind: "repo-edu.app-settings.v1",
  activeCourseId: course.id,
  activeTab: "roster",
  appearance: {
    theme: "system",
    windowChrome: "system",
    dateFormat: "DMY",
    timeFormat: "24h",
    syntaxTheme: "plus",
  },
  window: { width: 1180, height: 760 },
  lmsConnections: [],
  gitConnections: [],
  activeGitConnectionId: null,
  llmConnections: [],
  activeLlmConnectionId: null,
  examinationModelsByProvider: {},
  lastOpenedAt: null,
  rosterColumnVisibility: {},
  rosterColumnSizing: {},
  groupsSidebarSize: null,
  analysisSidebarSize: null,
  analysisDetailListSize: null,
  analysisSidebar: null,
  defaultExtensions: [],
  cacheEnabled: true,
  cacheSizeBudgetMB: { blameMB: 10000 },
  cacheHotBudgetMB: { blameMB: 500 },
  analysisConcurrency: { repoParallelism: 3, filesPerRepo: 1 },
}

describe("repository workflow helpers", () => {
  it("maps each operation to the correct workflow id", () => {
    assert.equal(resolveRepositoryWorkflowId("create"), "repo.create")
    assert.equal(resolveRepositoryWorkflowId("clone"), "repo.clone")
    assert.equal(resolveRepositoryWorkflowId("update"), "repo.update")
  })

  it("builds create input without clone-only fields", () => {
    const result = buildRepositoryWorkflowRequest({
      course,
      appSettings,
      assignmentId: "assignment-1",
      operation: "create",
      repositoryTemplate: template,
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

  it("builds update input without create/clone-only fields", () => {
    const result = buildRepositoryWorkflowRequest({
      course,
      appSettings,
      assignmentId: "assignment-1",
      operation: "update",
      repositoryTemplate: template,
      targetDirectory: "/tmp/repos",
      directoryLayout: "by-team",
    })

    assert.deepStrictEqual(result, {
      workflowId: "repo.update",
      input: {
        course,
        appSettings,
        assignmentId: "assignment-1",
      },
    })
  })
})
