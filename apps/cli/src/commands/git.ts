import type { WorkflowClient } from "@repo-edu/application-contract"
import type { Command } from "commander"
import {
  emitCommandError,
  requireGitConnection,
  toErrorMessage,
} from "../command-utils.js"
import { createCliWorkflowClient } from "../workflow-runtime.js"

export function registerGitCommands(
  parent: Command,
  createWorkflow: () => WorkflowClient = createCliWorkflowClient,
): void {
  const git = parent.command("git").description("Git platform operations")

  git
    .command("verify")
    .description("Verify the configured Git platform connection")
    .action(async function (this: Command) {
      const workflowClient = createWorkflow()

      try {
        const settings = await workflowClient.run("settings.loadApp", undefined)
        const connection = requireGitConnection(settings)

        const result = await workflowClient.run("connection.verifyGitDraft", {
          provider: connection.provider,
          baseUrl: connection.baseUrl,
          token: connection.token,
          userAgent: connection.userAgent,
        })

        process.stdout.write(
          `Git connection '${connection.id}' verified=${result.verified} checkedAt=${result.checkedAt}\n`,
        )
        if (!result.verified) {
          process.exitCode = 1
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })
}
