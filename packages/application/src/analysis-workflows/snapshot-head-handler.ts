import type {
  AnalysisResolveSnapshotHeadInput,
  AppError,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { normalizeProviderError, throwIfAborted } from "../workflow-helpers.js"
import type { AnalysisWorkflowPorts } from "./ports.js"
import { resolveAnalysisRepoRoot } from "./repo-root.js"
import { resolveSnapshotHead } from "./snapshot-engine.js"

export function createAnalysisSnapshotHeadHandler(
  ports: AnalysisWorkflowPorts,
): Pick<
  WorkflowHandlerMap<"analysis.resolveSnapshotHead">,
  "analysis.resolveSnapshotHead"
> {
  return {
    "analysis.resolveSnapshotHead": async (
      input: AnalysisResolveSnapshotHeadInput,
      options?: WorkflowCallOptions<never, never>,
    ): Promise<string> => {
      try {
        throwIfAborted(options?.signal)
        const repoRoot = resolveAnalysisRepoRoot(input)

        throwIfAborted(options?.signal)
        const gitCheckResult = await ports.gitCommand.run({
          args: ["rev-parse", "--git-dir"],
          cwd: repoRoot,
          signal: options?.signal,
        })
        if (gitCheckResult.exitCode !== 0) {
          throw {
            type: "provider",
            message: `'${repoRoot}' is not a git repository.`,
            provider: "git",
            operation: "rev-parse",
            retryable: false,
          } satisfies AppError
        }

        throwIfAborted(options?.signal)
        return await resolveSnapshotHead(
          ports.gitCommand,
          repoRoot,
          input.asOfCommit,
          input.until,
          options?.signal,
        )
      } catch (error) {
        if (typeof error === "object" && error !== null && "type" in error) {
          throw error
        }
        throw normalizeProviderError(
          error,
          "git",
          "analysis.resolveSnapshotHead",
        )
      }
    },
  }
}
