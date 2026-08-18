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
  createNodeProcessPort,
} from "@repo-edu/host-node"
import type { ChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"
import { createGitProviderDispatch } from "@repo-edu/integrations-git"
import { createLmsProviderDispatch } from "@repo-edu/integrations-lms"
import {
  createCliAppSettingsStore,
  createCliCourseStore,
} from "./state-store.js"

// The adapter is required, never defaulted. A composition that made its own
// would own process trees that no caller can stop and confirm.
export type CliWorkflowRuntimeOptions = {
  childProcessLifetimeController: ChildProcessLifetimeController
  signal?: AbortSignal
  storageRoot?: string
}

export function createCliWorkflowHandlers(options: CliWorkflowRuntimeOptions) {
  const courseStore = createCliCourseStore(options.storageRoot)
  const appSettingsStore = createCliAppSettingsStore(options.storageRoot)
  const http = createNodeHttpPort()
  const lms = createLmsProviderDispatch(http)
  const git = createGitProviderDispatch(http)

  const courseHandlers = createCourseWorkflowHandlers(courseStore)
  const connectionHandlers = createConnectionWorkflowHandlers({ lms, git })
  const settingsHandlers = createSettingsWorkflowHandlers(appSettingsStore)

  return {
    "course.list": courseHandlers["course.list"],
    "course.load": courseHandlers["course.load"],
    "course.save": courseHandlers["course.save"],
    "settings.loadApp": settingsHandlers["settings.loadApp"],
    "settings.savePreferences": settingsHandlers["settings.savePreferences"],
    "connection.verifyLmsDraft":
      connectionHandlers["connection.verifyLmsDraft"],
    "connection.verifyGitDraft":
      connectionHandlers["connection.verifyGitDraft"],
    ...createValidationWorkflowHandlers(),
    ...createRepositoryWorkflowHandlers({
      git,
      gitCommand: createNodeGitCommandPort(
        createNodeProcessPort(options.childProcessLifetimeController),
      ),
      fileSystem: createNodeFileSystemPort(),
    }),
  }
}

export type CliRuntimeProcess = {
  stdout: Pick<NodeJS.WriteStream, "write">
  stderr: Pick<NodeJS.WriteStream, "write">
}

export function createCliWorkflowClientFromBase(
  base: WorkflowClient,
  runtimeProcess: CliRuntimeProcess = process,
  defaultSignal?: AbortSignal,
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
      return base.run(workflowId, input, {
        ...options,
        signal: options?.signal ?? defaultSignal,
        // Safe: all workflow progress types are MilestoneProgress,
        // and all output types are DiagnosticOutput.
        onProgress: options?.onProgress ?? (writeProgressToRuntime as never),
        onOutput: options?.onOutput ?? (writeOutputToRuntime as never),
      })
    },
  }
}

export function createCliWorkflowClient(
  options: CliWorkflowRuntimeOptions,
): WorkflowClient {
  return createCliWorkflowClientFromBase(
    createWorkflowClient(createCliWorkflowHandlers(options)),
    process,
    options.signal,
  )
}
