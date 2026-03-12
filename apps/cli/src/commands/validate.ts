import type { Command } from "commander"
import {
  emitCommandError,
  loadSelectedCourse,
  resolveAssignmentFromCourse,
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
        const { course } = await loadSelectedCourse(this, workflowClient)
        const assignment = resolveAssignmentFromCourse(
          course,
          options.assignment,
        )

        if (!assignment) {
          emitCommandError(
            `Assignment '${options.assignment}' was not found in course '${course.id}'.`,
          )
          return
        }

        const rosterValidation = await workflowClient.run("validation.roster", {
          course,
        })
        const assignmentValidation = await workflowClient.run(
          "validation.assignment",
          {
            course,
            assignmentId: assignment.id,
          },
        )

        const allIssues = [
          ...rosterValidation.issues,
          ...assignmentValidation.issues,
        ]

        if (allIssues.length === 0) {
          process.stdout.write(
            `Validation passed for assignment '${assignment.name}' in course '${course.id}'.\n`,
          )
          return
        }

        process.stdout.write(
          `Validation found ${allIssues.length} issue(s) for assignment '${assignment.name}' in course '${course.id}':\n`,
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
