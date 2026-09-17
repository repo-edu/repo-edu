import type { WorkflowClient } from "@repo-edu/application-contract"
import type { Command } from "commander"
import type { CliOutput } from "../command-utils.js"
import {
  emitCommandError,
  loadAppSettings,
  requireGitConnection,
  toErrorMessage,
} from "../command-utils.js"

export function registerGitCommands(
  parent: Command,
  createWorkflow: () => WorkflowClient,
  output: CliOutput,
): void {
  const git = parent.command("git").description("Git platform operations")

  git
    .command("verify")
    .description("Verify the configured Git platform connection")
    .action(async function (this: Command) {
      const workflowClient = createWorkflow()

      try {
        const settings = await loadAppSettings(workflowClient)
        const connection = requireGitConnection(settings.credentials)

        const result = await workflowClient.run("connection.verifyGitDraft", {
          provider: connection.provider,
          baseUrl: connection.baseUrl,
          token: connection.token,
          userAgent: connection.userAgent,
        })

        output.writeOut(
          `Git connection '${connection.id}' verified=${result.verified} checkedAt=${result.checkedAt}\n`,
        )
        if (!result.verified) {
          output.setExitCode(1)
        }
      } catch (error) {
        emitCommandError(output, toErrorMessage(error))
      }
    })
}
