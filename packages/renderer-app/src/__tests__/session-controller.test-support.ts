import type {
  AppSettingsLoadResult,
  WorkflowClient,
  WorkflowId,
  WorkflowResult,
} from "@repo-edu/application-contract"
import {
  defaultAppSettings,
  type PersistedAppSettings,
  splitAppSettings,
} from "@repo-edu/domain/settings"
import {
  type PersistedCourse,
  persistedCourseKind,
} from "@repo-edu/domain/types"
import { SessionController } from "../session/session-controller.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { useCredentialsStore } from "../stores/credentials-store.js"
import { useToastStore } from "../stores/toast-store.js"
import { useUiStore } from "../stores/ui-store.js"

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function makeCourse(id: string, displayName = id): PersistedCourse {
  return {
    kind: persistedCourseKind,
    backing: "lms",
    revision: 0,
    id,
    displayName,
    lmsConnectionId: null,
    organization: null,
    lmsCourseId: null,
    idSequences: {
      nextGroupSeq: 1,
      nextGroupSetSeq: 1,
      nextMemberSeq: 1,
      nextAssignmentSeq: 1,
      nextTeamSeq: 1,
    },
    roster: {
      connection: null,
      students: [],
      staff: [],
      groups: [],
      groupSets: [],
      assignments: [],
    },
    repositoryTemplate: null,
    searchFolder: null,
    analysisInputs: {},
    updatedAt: "2026-05-29T00:00:00.000Z",
  }
}

export function makeSettings(
  overrides: Partial<PersistedAppSettings> = {},
): AppSettingsLoadResult {
  return {
    ...splitAppSettings({ ...defaultAppSettings, ...overrides }),
    recovery: [],
  }
}

export function workflowClient(
  run: (workflowId: WorkflowId, input: unknown) => Promise<unknown>,
): WorkflowClient {
  return {
    run: async (workflowId, input) =>
      (await run(workflowId, input)) as WorkflowResult<typeof workflowId>,
  } as WorkflowClient
}

// Mirrors RendererSessionRoot: construct, then start bootstrap explicitly.
export function startController(
  options: ConstructorParameters<typeof SessionController>[0],
): SessionController {
  const controller = new SessionController(options)
  controller.start()
  return controller
}

export async function waitForSnapshot(
  controller: SessionController,
  predicate: (
    snapshot: ReturnType<SessionController["getSnapshot"]>,
  ) => boolean,
): Promise<void> {
  if (predicate(controller.getSnapshot())) return
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(
        new Error(
          `Timed out waiting for controller snapshot: ${JSON.stringify(
            controller.getSnapshot(),
          )}`,
        ),
      )
    }, 1000)
    const unsubscribe = controller.subscribe(() => {
      if (!predicate(controller.getSnapshot())) return
      clearTimeout(timeout)
      unsubscribe()
      resolve()
    })
  })
}

export function resetStores() {
  useAppSettingsStore.getState().reset()
  useCredentialsStore.getState().reset()
  useCourseStore.getState().clear()
  useToastStore.getState().clearToasts()
  useUiStore.getState().reset()
}
