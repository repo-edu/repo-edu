import {
  createConnectionWorkflowHandlers,
  createCourseWorkflowHandlers,
  createGroupSetWorkflowHandlers,
  createRepositoryWorkflowHandlers,
  createRosterWorkflowHandlers,
  createSettingsWorkflowHandlers,
  createValidationWorkflowHandlers,
} from "@repo-edu/application"
import {
  createWorkflowClient,
  type DiagnosticOutput,
  type MilestoneProgress,
  type WorkflowClient,
} from "@repo-edu/application-contract"
import {
  createNodeFileSystemPort,
  createNodeGitCommandPort,
  createNodeHttpPort,
} from "@repo-edu/host-node"
import type {
  UserFilePort,
  UserFileReadRef,
  UserSaveTargetWriteRef,
} from "@repo-edu/host-runtime-contract"
import { createGitProviderDispatch } from "@repo-edu/integrations-git"
import { createLmsProviderDispatch } from "@repo-edu/integrations-lms"
import {
  createCliAppSettingsStore,
  createCliCourseStore,
} from "./state-store.js"

const unsupportedUserFilePort: UserFilePort = {
  async readText(reference: UserFileReadRef) {
    throw new Error(
      `CLI does not support file-reference reads for '${reference.displayName}'.`,
    )
  },
  async writeText(reference: UserSaveTargetWriteRef) {
    throw new Error(
      `CLI does not support save-target writes for '${reference.displayName}'.`,
    )
  },
}

export function createCliWorkflowHandlers() {
  const courseStore = createCliCourseStore()
  const appSettingsStore = createCliAppSettingsStore()
  const http = createNodeHttpPort()
  const lms = createLmsProviderDispatch(http)
  const git = createGitProviderDispatch(http)
  const connectionHandlers = createConnectionWorkflowHandlers({ lms, git })
  const rosterHandlers = createRosterWorkflowHandlers({
    lms,
    userFile: unsupportedUserFilePort,
  })
  const groupSetHandlers = createGroupSetWorkflowHandlers({
    lms,
    userFile: unsupportedUserFilePort,
  })

  return {
    ...createCourseWorkflowHandlers(courseStore),
    ...createSettingsWorkflowHandlers(appSettingsStore),
    ...connectionHandlers,
    ...createValidationWorkflowHandlers(),
    "roster.importFromLms": rosterHandlers["roster.importFromLms"],
    "groupSet.fetchAvailableFromLms":
      groupSetHandlers["groupSet.fetchAvailableFromLms"],
    "groupSet.syncFromLms": groupSetHandlers["groupSet.syncFromLms"],
    ...createRepositoryWorkflowHandlers({
      git,
      gitCommand: createNodeGitCommandPort(),
      fileSystem: createNodeFileSystemPort(),
    }),
  }
}

function writeProgressToStderr(event: MilestoneProgress): void {
  process.stderr.write(`[${event.step}/${event.totalSteps}] ${event.label}\n`)
}

function writeOutputToStderr(event: DiagnosticOutput): void {
  const stream =
    event.channel === "stderr" || event.channel === "warn"
      ? process.stderr
      : process.stdout
  stream.write(`${event.message}\n`)
}

export function createCliWorkflowClient(): WorkflowClient {
  const base = createWorkflowClient(createCliWorkflowHandlers())

  return {
    run(workflowId, input, options) {
      if (options?.signal) {
        return (base as WorkflowClient).run(workflowId, input, {
          ...options,
          onProgress: options.onProgress ?? (writeProgressToStderr as never),
          onOutput: options.onOutput ?? (writeOutputToStderr as never),
        })
      }

      const abortController = new AbortController()
      let sigintCount = 0
      const onSigint = () => {
        sigintCount++
        if (sigintCount === 1) {
          abortController.abort()
          process.stderr.write("\nAborting...\n")
        } else {
          process.exit(130)
        }
      }

      process.on("SIGINT", onSigint)

      return (base as WorkflowClient)
        .run(workflowId, input, {
          ...options,
          signal: abortController.signal,
          // Safe: all workflow progress types are MilestoneProgress,
          // and all output types are DiagnosticOutput.
          onProgress: options?.onProgress ?? (writeProgressToStderr as never),
          onOutput: options?.onOutput ?? (writeOutputToStderr as never),
        })
        .finally(() => {
          process.off("SIGINT", onSigint)
        })
    },
  }
}
