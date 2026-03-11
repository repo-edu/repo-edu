import type { Command } from "commander"
import {
  emitCommandError,
  loadSelectedProfile,
  resolveAssignmentFromProfile,
  toErrorMessage,
} from "../command-utils.js"
import { createCliWorkflowClient } from "../workflow-runtime.js"

export function registerValidateCommand(parent: Command): void {
  parent
    .command("validate")
    .description("Validate assignment readiness")
    .requiredOption("--assignment <name>", "Assignment name or id")
    .action(async function (this: Command, options: { assignment: string }) {
      const workflowClient = createCliWorkflowClient()

      try {
        const { profile } = await loadSelectedProfile(this, workflowClient)
        const assignment = resolveAssignmentFromProfile(
          profile,
          options.assignment,
        )

        if (!assignment) {
          emitCommandError(
            `Assignment '${options.assignment}' was not found in profile '${profile.id}'.`,
          )
          return
        }

        const rosterValidation = await workflowClient.run("validation.roster", {
          profile,
        })
        const assignmentValidation = await workflowClient.run(
          "validation.assignment",
          {
            profile,
            assignmentId: assignment.id,
          },
        )

        const allIssues = [
          ...rosterValidation.issues,
          ...assignmentValidation.issues,
        ]

        if (allIssues.length === 0) {
          process.stdout.write(
            `Validation passed for assignment '${assignment.name}' in profile '${profile.id}'.\n`,
          )
          return
        }

        process.stdout.write(
          `Validation found ${allIssues.length} issue(s) for assignment '${assignment.name}' in profile '${profile.id}':\n`,
        )
        for (const issue of allIssues) {
          process.stdout.write(
            `- ${issue.kind} [${issue.affectedIds.join(", ")}]${issue.context ? `: ${issue.context}` : ""}\n`,
          )
        }

        process.exitCode = 1
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })
}
