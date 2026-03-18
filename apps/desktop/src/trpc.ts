import {
  type AppSettingsStore,
  type CourseStore,
  createConnectionWorkflowHandlers,
  createCourseWorkflowHandlers,
  createGitUsernameWorkflowHandlers,
  createGroupSetWorkflowHandlers,
  createRepositoryWorkflowHandlers,
  createRosterWorkflowHandlers,
  createSettingsWorkflowHandlers,
  createValidationWorkflowHandlers,
  runInspectUserFileWorkflow,
  runUserFileExportPreviewWorkflow,
} from "@repo-edu/application"
import type {
  AppError,
  WorkflowEventFor,
  WorkflowHandler,
  WorkflowHandlerMap,
  WorkflowId,
  WorkflowInput,
} from "@repo-edu/application-contract"
import {
  createCancelledAppError,
  isAppError,
  type workflowCatalog,
} from "@repo-edu/application-contract"
import type {
  FileSystemPort,
  GitCommandPort,
  HttpPort,
  UserFilePort,
} from "@repo-edu/host-runtime-contract"
import { createGitProviderDispatch } from "@repo-edu/integrations-git"
import { createLmsProviderDispatch } from "@repo-edu/integrations-lms"
import { initTRPC } from "@trpc/server"
import { observable } from "@trpc/server/observable"

const t = initTRPC.create()

type DesktopWorkflowId = keyof typeof workflowCatalog

export type DesktopRouterPorts = {
  http: HttpPort
  courseStore: CourseStore
  appSettingsStore: AppSettingsStore
  userFile: UserFilePort
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
}

function createDesktopWorkflowRegistry(
  ports: DesktopRouterPorts,
): WorkflowHandlerMap<DesktopWorkflowId> {
  const lms = createLmsProviderDispatch(ports.http)
  const git = createGitProviderDispatch(ports.http)

  return {
    ...createCourseWorkflowHandlers(ports.courseStore),
    ...createSettingsWorkflowHandlers(ports.appSettingsStore),
    ...createConnectionWorkflowHandlers({ lms, git }),
    ...createRosterWorkflowHandlers({
      lms,
      userFile: ports.userFile,
    }),
    ...createGroupSetWorkflowHandlers({
      lms,
      userFile: ports.userFile,
    }),
    ...createGitUsernameWorkflowHandlers({
      userFile: ports.userFile,
      git,
    }),
    ...createValidationWorkflowHandlers(),
    ...createRepositoryWorkflowHandlers({
      git,
      gitCommand: ports.gitCommand,
      fileSystem: ports.fileSystem,
    }),
    "userFile.inspectSelection": (input, options) =>
      runInspectUserFileWorkflow(ports.userFile, input, options),
    "userFile.exportPreview": (input, options) =>
      runUserFileExportPreviewWorkflow(ports.userFile, input, options),
  }
}

function createWorkflowSubscriptionProcedure<
  TWorkflowId extends DesktopWorkflowId,
>(handler: WorkflowHandler<TWorkflowId>) {
  return t.procedure
    .input({
      parse(value: unknown): WorkflowInput<TWorkflowId> {
        return value as WorkflowInput<TWorkflowId>
      },
    })
    .subscription(({ input }) =>
      observable<WorkflowEventFor<TWorkflowId>>((emit) => {
        const abortController = new AbortController()

        handler(input, {
          signal: abortController.signal,
          onProgress(data) {
            emit.next({ type: "progress", data })
          },
          onOutput(data) {
            emit.next({ type: "output", data })
          },
        })
          .then((result) => {
            emit.next({ type: "completed", data: result })
            emit.complete()
          })
          .catch((error) => {
            emitFailure(emit, abortController.signal, error)
          })

        return () => {
          abortController.abort()
        }
      }),
    )
}

/**
 * Creates the Electron main-side tRPC router for all shared workflow ids.
 *
 * Workflow registration is compile-time exhaustive through WorkflowHandlerMap.
 */
export function createDesktopRouter(ports: DesktopRouterPorts) {
  const workflowRegistry = createDesktopWorkflowRegistry(ports)

  const procedures = Object.fromEntries(
    (Object.keys(workflowRegistry) as DesktopWorkflowId[]).map((workflowId) => [
      workflowId,
      createWorkflowSubscriptionProcedure(
        workflowRegistry[workflowId] as WorkflowHandler<typeof workflowId>,
      ),
    ]),
  )

  return t.router(procedures)
}

function emitFailure(
  emit: {
    next(value: { type: "failed"; error: AppError }): void
    complete(): void
  },
  signal: AbortSignal,
  error: unknown,
) {
  if (signal.aborted) {
    emit.next({
      type: "failed",
      error: createCancelledAppError(),
    })
  } else if (isAppError(error)) {
    emit.next({
      type: "failed",
      error,
    })
  } else {
    emit.next({
      type: "failed",
      error: {
        type: "unexpected",
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      },
    })
  }

  emit.complete()
}

export type DesktopRouter = ReturnType<typeof createDesktopRouter>
export type { DesktopWorkflowId as DesktopWorkflowKey, WorkflowId }
