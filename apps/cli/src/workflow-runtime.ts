import {
  createConnectionWorkflowHandlers,
  createCourseWorkflowHandlers,
  createRepositoryWorkflowHandlers,
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
import { createGitProviderDispatch } from "@repo-edu/integrations-git"
import { createLmsProviderDispatch } from "@repo-edu/integrations-lms"
import {
  createCliAppSettingsStore,
  createCliCourseStore,
} from "./state-store.js"

export function createCliWorkflowHandlers() {
  const courseStore = createCliCourseStore()
  const appSettingsStore = createCliAppSettingsStore()
  const http = createNodeHttpPort()
  const lms = createLmsProviderDispatch(http)
  const git = createGitProviderDispatch(http)

  const courseHandlers = createCourseWorkflowHandlers(courseStore)
  const connectionHandlers = createConnectionWorkflowHandlers({ lms, git })

  return {
    "course.list": courseHandlers["course.list"],
    "course.load": courseHandlers["course.load"],
    "course.save": courseHandlers["course.save"],
    ...createSettingsWorkflowHandlers(appSettingsStore),
    "connection.verifyLmsDraft":
      connectionHandlers["connection.verifyLmsDraft"],
    "connection.verifyGitDraft":
      connectionHandlers["connection.verifyGitDraft"],
    ...createValidationWorkflowHandlers(),
    ...createRepositoryWorkflowHandlers({
      git,
      gitCommand: createNodeGitCommandPort(),
      fileSystem: createNodeFileSystemPort(),
    }),
  }
}

export type CliRuntimeProcess = Pick<NodeJS.Process, "on" | "off" | "exit"> & {
  stdout: Pick<NodeJS.WriteStream, "write">
  stderr: Pick<NodeJS.WriteStream, "write">
}

export function createCliWorkflowClientFromBase(
  base: WorkflowClient,
  runtimeProcess: CliRuntimeProcess = process,
): WorkflowClient {
  function writeProgressToRuntime(event: MilestoneProgress): void {
    runtimeProcess.stderr.write(
      `[${event.step}/${event.totalSteps}] ${event.label}\n`,
    )
  }

  function writeOutputToRuntime(event: DiagnosticOutput): void {
    const stream =
      event.channel === "stderr" || event.channel === "warn"
        ? runtimeProcess.stderr
        : runtimeProcess.stdout
    stream.write(`${event.message}\n`)
  }

  return {
    run(workflowId, input, options) {
      if (options?.signal) {
        return base.run(workflowId, input, {
          ...options,
          onProgress: options.onProgress ?? (writeProgressToRuntime as never),
          onOutput: options.onOutput ?? (writeOutputToRuntime as never),
        })
      }

      const abortController = new AbortController()
      let sigintCount = 0
      const onSigint = () => {
        sigintCount++
        if (sigintCount === 1) {
          abortController.abort()
          runtimeProcess.stderr.write("\nAborting...\n")
        } else {
          runtimeProcess.exit(130)
        }
      }

      runtimeProcess.on("SIGINT", onSigint)

      try {
        return base
          .run(workflowId, input, {
            ...options,
            signal: abortController.signal,
            // Safe: all workflow progress types are MilestoneProgress,
            // and all output types are DiagnosticOutput.
            onProgress:
              options?.onProgress ?? (writeProgressToRuntime as never),
            onOutput: options?.onOutput ?? (writeOutputToRuntime as never),
          })
          .finally(() => {
            runtimeProcess.off("SIGINT", onSigint)
          })
      } catch (error) {
        runtimeProcess.off("SIGINT", onSigint)
        throw error
      }
    },
  }
}

export function createCliWorkflowClient(): WorkflowClient {
  return createCliWorkflowClientFromBase(
    createWorkflowClient(createCliWorkflowHandlers()),
  )
}
