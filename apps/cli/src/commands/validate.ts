import type { WorkflowClient } from "@repo-edu/application-contract"
import type { Command } from "commander"
import type { CliOutput } from "../command-utils.js"
import {
  emitCommandError,
  loadSelectedCourse,
  resolveAssignmentFromCourse,
  toErrorMessage,
} from "../command-utils.js"

export function registerValidateCommand(
  parent: Command,
  createWorkflow: () => WorkflowClient,
  output: CliOutput,
): void {
  parent
    .command("validate")
    .description("Validate assignment readiness")
    .requiredOption("--assignment <name>", "Assignment name or id")
    .action(async function (this: Command, options: { assignment: string }) {
      const workflowClient = createWorkflow()

      try {
        const { course } = await loadSelectedCourse(this, workflowClient)
        const assignment = resolveAssignmentFromCourse(
          course,
          options.assignment,
        )

        if (!assignment) {
          emitCommandError(
            output,
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
          output.writeOut(
            `Validation passed for assignment '${assignment.name}' in course '${course.id}'.\n`,
          )
          return
        }

        output.writeOut(
          `Validation found ${allIssues.length} issue(s) for assignment '${assignment.name}' in course '${course.id}':\n`,
        )
        for (const issue of allIssues) {
          output.writeOut(
            `- ${issue.kind} [${issue.affectedIds.join(", ")}]${issue.context ? `: ${issue.context}` : ""}\n`,
          )
        }

        output.setExitCode(1)
      } catch (error) {
        emitCommandError(output, toErrorMessage(error))
      }
    })
}
