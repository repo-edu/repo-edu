import {
  type AppSettingsStore,
  type CourseStore,
  createAnalysisWorkflowHandlers,
  createConnectionWorkflowHandlers,
  createCourseWorkflowHandlers,
  createExaminationWorkflowHandlers,
  createGitUsernameWorkflowHandlers,
  createGroupSetWorkflowHandlers,
  createLruAnalysisCache,
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
  isAppError,
  type workflowCatalog,
} from "@repo-edu/application-contract"
import type {
  FileSystemPort,
  GitCommandPort,
  HttpPort,
  LlmPort,
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
  llm: LlmPort
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
    ...createAnalysisWorkflowHandlers({
      gitCommand: ports.gitCommand,
      fileSystem: ports.fileSystem,
      cache: createLruAnalysisCache(32),
    }),
    ...createExaminationWorkflowHandlers({
      llm: ports.llm,
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
        const emitNext = (value: WorkflowEventFor<TWorkflowId>) => {
          if (abortController.signal.aborted) {
            return
          }

          try {
            emit.next(value)
          } catch {
            // Stream can already be closed during shutdown races.
          }
        }
        const emitComplete = () => {
          if (abortController.signal.aborted) {
            return
          }

          try {
            emit.complete()
          } catch {
            // Stream can already be closed during shutdown races.
          }
        }

        handler(input, {
          signal: abortController.signal,
          onProgress(data) {
            emitNext({ type: "progress", data })
          },
          onOutput(data) {
            emitNext({ type: "output", data })
          },
        })
          .then((result) => {
            emitNext({ type: "completed", data: result })
            emitComplete()
          })
          .catch((error) => {
            if (abortController.signal.aborted) {
              return
            }

            emitNext({
              type: "failed",
              error: toAppError(error),
            })
            emitComplete()
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

function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error
  }

  return {
    type: "unexpected",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  }
}

export type DesktopRouter = ReturnType<typeof createDesktopRouter>
export type { DesktopWorkflowId as DesktopWorkflowKey, WorkflowId }
