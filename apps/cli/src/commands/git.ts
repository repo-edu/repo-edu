import type { Command } from "commander"
import {
  emitCommandError,
  loadSelectedProfile,
  requireGitConnection,
  toErrorMessage,
} from "../command-utils.js"
import { createCliWorkflowClient } from "../workflow-runtime.js"

export function registerGitCommands(parent: Command): void {
  const git = parent.command("git").description("Git platform operations")

  git
    .command("verify")
    .description("Verify Git platform connection for selected profile")
    .action(async function (this: Command) {
      const workflowClient = createCliWorkflowClient()

      try {
        const { profile, settings } = await loadSelectedProfile(
          this,
          workflowClient,
        )
        const connection = requireGitConnection(profile, settings)

        const result = await workflowClient.run("connection.verifyGitDraft", {
          provider: connection.provider,
          baseUrl: connection.baseUrl,
          token: connection.token,
          organization: connection.organization,
        })

        process.stdout.write(
          `Git connection '${connection.name}' verified=${result.verified} checkedAt=${result.checkedAt}\n`,
        )
        if (!result.verified) {
          process.exitCode = 1
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })
}
