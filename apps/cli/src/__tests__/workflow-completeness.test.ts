import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { workflowCatalog } from "@repo-edu/application-contract"
import { createProgram } from "../cli.js"

/**
 * Maps each CLI-deliverable workflow to the command path(s) that exercise it.
 *
 * - `direct`: a single command maps to one workflow.
 * - `composite`: a command that runs multiple workflows intentionally.
 *
 * Update this matrix when:
 * - A workflow delivery surface changes.
 * - A CLI command is added or removed.
 */
const workflowToCommandMatrix: Record<
  string,
  { kind: "direct" | "composite"; commands: string[] }
> = {
  "course.list": { kind: "direct", commands: ["course list"] },
  "course.load": { kind: "composite", commands: ["course load"] },
  "course.save": {
    kind: "composite",
    commands: ["repo create", "repo update"],
  },
  "settings.loadApp": {
    kind: "composite",
    commands: ["course list", "course active", "course load"],
  },
  "settings.saveApp": { kind: "composite", commands: ["course load"] },
  "connection.verifyLmsDraft": { kind: "direct", commands: ["lms verify"] },
  "connection.verifyGitDraft": { kind: "direct", commands: ["git verify"] },
  "validation.roster": {
    kind: "composite",
    commands: ["validate"],
  },
  "validation.assignment": {
    kind: "direct",
    commands: ["validate --assignment"],
  },
  "repo.create": { kind: "direct", commands: ["repo create"] },
  "repo.clone": { kind: "direct", commands: ["repo clone"] },
  "repo.update": { kind: "direct", commands: ["repo update"] },
}

describe("CLI workflow-to-command completeness", () => {
  it("every CLI-deliverable workflow has at least one mapped command path", () => {
    const cliWorkflows = Object.entries(workflowCatalog)
      .filter(([, metadata]) => metadata.delivery.includes("cli"))
      .map(([workflowId]) => workflowId)
      .sort()

    const matrixWorkflows = Object.keys(workflowToCommandMatrix).sort()

    assert.deepEqual(
      matrixWorkflows,
      cliWorkflows,
      "Workflow-to-command matrix is out of sync with workflowCatalog CLI entries.",
    )
  })

  it("every command path in the matrix references a resolvable Commander command", () => {
    const program = createProgram()

    for (const [workflowId, entry] of Object.entries(workflowToCommandMatrix)) {
      for (const commandPath of entry.commands) {
        const parts = commandPath.split(" ").filter((p) => !p.startsWith("-"))
        let current = program

        for (const part of parts) {
          const sub = current.commands.find((c) => c.name() === part)
          assert.ok(
            sub,
            `Command path '${commandPath}' for workflow '${workflowId}' not found at segment '${part}'.`,
          )
          current = sub
        }
      }
    }
  })

  it("dropped commands are not resolvable in the command tree", () => {
    const program = createProgram()

    const droppedPaths = [
      ["course", "delete"],
      ["roster"],
      ["lms", "list-courses"],
      ["lms", "import-students"],
      ["lms", "import-groups"],
      ["lms", "cache"],
    ]

    for (const segments of droppedPaths) {
      let current = program
      let found = true

      for (const part of segments) {
        const sub = current.commands.find((c) => c.name() === part)
        if (!sub) {
          found = false
          break
        }
        current = sub
      }

      assert.equal(
        found,
        false,
        `Dropped command path '${segments.join(" ")}' should not exist in CLI tree.`,
      )
    }
  })
})
