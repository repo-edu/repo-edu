import type {
  AppError,
  DiagnosticOutput,
  MilestoneProgress,
  RepositoryListNamespaceInput,
  RepositoryListNamespaceResult,
  VerifyGitDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  isSharedAppError,
  normalizeProviderError,
  resolveAppSettingsSnapshot,
  resolveGitDraft,
  throwIfAborted,
} from "../workflow-helpers.js"
import type { RepositoryWorkflowPorts } from "./ports.js"

export function createRepoListNamespaceHandler(
  ports: RepositoryWorkflowPorts,
): Pick<WorkflowHandlerMap<"repo.listNamespace">, "repo.listNamespace"> {
  return {
    "repo.listNamespace": async (
      input: RepositoryListNamespaceInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<RepositoryListNamespaceResult> => {
      const totalSteps = 2
      let providerForError: VerifyGitDraftInput["provider"] = "github"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading app settings snapshot.",
        })
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        const gitDraft = resolveGitDraft(settings)
        if (gitDraft === null) {
          throw {
            type: "not-found",
            message: "No Git connection is configured in settings.",
            resource: "connection",
          } satisfies AppError
        }
        providerForError = gitDraft.provider

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Listing repositories from Git provider.",
        })
        const listed = await ports.git.listRepositories(
          gitDraft,
          {
            namespace: input.namespace,
            filter: input.filter,
            includeArchived: input.includeArchived,
          },
          options?.signal,
        )
        // Sort by subgroup path first so every repository belonging to the
        // same group clusters together, then by leaf name within each group.
        // Top-level repositories (no subgroup) sort first under the empty
        // string. The ordering is case-insensitive so scanning a long list
        // reads naturally on every surface (UI preview, CLI discover output).
        const subgroupOf = (entry: {
          name: string
          identifier: string
        }): string => {
          if (entry.identifier === entry.name) return ""
          const suffix = `/${entry.name}`
          return entry.identifier.endsWith(suffix)
            ? entry.identifier.slice(0, -suffix.length)
            : ""
        }
        const repositories = [...listed.repositories].sort((a, b) => {
          const subgroupOrder = subgroupOf(a).localeCompare(
            subgroupOf(b),
            undefined,
            { sensitivity: "base" },
          )
          if (subgroupOrder !== 0) return subgroupOrder
          return a.name.localeCompare(b.name, undefined, {
            sensitivity: "base",
          })
        })
        options?.onOutput?.({
          channel: "info",
          message: `Found ${repositories.length} repositor${
            repositories.length === 1 ? "y" : "ies"
          } in namespace '${input.namespace}'.`,
        })
        return { repositories }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(
          error,
          providerForError,
          "listRepositories",
        )
      }
    },
  }
}
