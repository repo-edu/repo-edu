import type { Command } from "commander"
import {
  emitCommandError,
  loadSelectedCourse,
  requireLmsConnection,
  toErrorMessage,
} from "../command-utils.js"
import { createCliWorkflowClient } from "../workflow-runtime.js"

export function registerLmsCommands(parent: Command): void {
  const lms = parent.command("lms").description("LMS operations")

  lms
    .command("verify")
    .description("Verify LMS connection for selected course")
    .action(async function (this: Command) {
      const workflowClient = createCliWorkflowClient()

      try {
        const { course, settings } = await loadSelectedCourse(
          this,
          workflowClient,
        )
        const connection = requireLmsConnection(course, settings)
        const result = await workflowClient.run("connection.verifyLmsDraft", {
          provider: connection.provider,
          baseUrl: connection.baseUrl,
          token: connection.token,
          userAgent: connection.userAgent,
        })

        process.stdout.write(
          `LMS connection '${connection.name}' verified=${result.verified} checkedAt=${result.checkedAt}\n`,
        )
        if (!result.verified) {
          process.exitCode = 1
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })
}
