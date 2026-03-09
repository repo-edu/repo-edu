import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { RepositoryTemplate } from "@repo-edu/domain"
import {
  buildRepositoryWorkflowRequest,
  resolveRepositoryWorkflowId,
} from "../utils/repository-workflow.js"

const template: RepositoryTemplate = {
  owner: "repo-edu",
  name: "starter-template",
  visibility: "private",
}

describe("repository workflow helpers", () => {
  it("maps each operation to the correct workflow id", () => {
    assert.equal(resolveRepositoryWorkflowId("create"), "repo.create")
    assert.equal(resolveRepositoryWorkflowId("clone"), "repo.clone")
    assert.equal(resolveRepositoryWorkflowId("delete"), "repo.delete")
  })

  it("builds create input without clone/delete-only fields", () => {
    const result = buildRepositoryWorkflowRequest({
      activeProfileId: "profile-1",
      assignmentId: "assignment-1",
      operation: "create",
      repositoryTemplate: template,
      targetDirectory: "/tmp/repos",
      directoryLayout: "flat",
    })

    assert.deepStrictEqual(result, {
      workflowId: "repo.create",
      input: {
        profileId: "profile-1",
        assignmentId: "assignment-1",
        template,
      },
    })
  })

  it("builds clone input with directory options", () => {
    const result = buildRepositoryWorkflowRequest({
      activeProfileId: "profile-1",
      assignmentId: "assignment-1",
      operation: "clone",
      repositoryTemplate: template,
      targetDirectory: "/tmp/repos",
      directoryLayout: "by-team",
    })

    assert.deepStrictEqual(result, {
      workflowId: "repo.clone",
      input: {
        profileId: "profile-1",
        assignmentId: "assignment-1",
        template,
        targetDirectory: "/tmp/repos",
        directoryLayout: "by-team",
      },
    })
  })

  it("builds delete input with explicit confirmation", () => {
    const result = buildRepositoryWorkflowRequest({
      activeProfileId: "profile-1",
      assignmentId: "assignment-1",
      operation: "delete",
      repositoryTemplate: template,
      targetDirectory: "/tmp/repos",
      directoryLayout: "flat",
    })

    assert.deepStrictEqual(result, {
      workflowId: "repo.delete",
      input: {
        profileId: "profile-1",
        assignmentId: "assignment-1",
        template,
        confirmDelete: true,
      },
    })
  })
})
