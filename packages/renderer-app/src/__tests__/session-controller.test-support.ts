import {
  type AppSettingsLoadResult,
  type CommitPersistencePreparation,
  type ExclusiveCommandClient,
  HostAdmissionRefusedError,
  type WorkflowClient,
  type WorkflowId,
  type WorkflowResult,
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
import {
  selectActiveCourseId,
  selectActiveSurface,
} from "../session/selectors.js"
import { SessionController } from "../session/session-controller.js"
import type { SessionControllerSnapshot } from "../session/session-reducer.js"
import { bindSessionStart } from "../session/session-start.js"
import type { SessionStartId } from "../session/session-start-inventory.js"
import { useCourseStore } from "../stores/course-store.js"
import { useToastStore } from "../stores/toast-store.js"
import { useUiStore } from "../stores/ui-store.js"

export function testSessionStart(id: SessionStartId = "analysisRun") {
  return bindSessionStart(id, (start) => start)()
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export const commitPreparation: CommitPersistencePreparation = async ({
  course,
}) =>
  course
    ? {
        course: {
          courseId: course.id,
          revision: course.revision + 1,
          updatedAt: "2026-09-07T00:00:00.000Z",
        },
      }
    : {}

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

type CommandHost = {
  /** The host's answer to command intent. */
  admission?: () => "accepted" | "busy"
  /** The host's durable commit of the preparation bundle. */
  commit?: CommitPersistencePreparation
}

/** Follows the desktop client's order: intent admission, persistence
 * preparation, input capture, execution, then settlement of the body. */
export function commandClient(
  client: WorkflowClient,
  {
    admission = () => "accepted",
    commit = commitPreparation,
  }: CommandHost = {},
): ExclusiveCommandClient {
  return {
    async runBody(_command, preparation, body, settle) {
      const outcome = await body({
        async run(id, capture, options) {
          if (admission() === "busy") throw new HostAdmissionRefusedError()
          await preparation(commit)
          return await client.run(id, capture(), options)
        },
      }).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      )
      await settle()
      if (!outcome.ok) throw outcome.error
      return outcome.value
    },
  }
}

// Mirrors RendererSessionRoot: construct, then start bootstrap explicitly.
export function startController(
  options: Omit<
    ConstructorParameters<typeof SessionController>[0],
    "onBootstrapReady" | "commandClient"
  > & {
    onBootstrapReady?: () => Promise<void>
    commandClient?: ExclusiveCommandClient
  },
): SessionController {
  const controller = new SessionController({
    onBootstrapReady: async () => {},
    commandClient: commandClient(options.workflowClient),
    ...options,
  })
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
  useCourseStore.getState().clear()
  useToastStore.getState().clearToasts()
  useUiStore.getState().reset()
}

export const activeCourseId = selectActiveCourseId
export const activeSurface = selectActiveSurface
export function pendingTransaction(snapshot: SessionControllerSnapshot) {
  const turnId = snapshot.transactions.runningTurnId
  return turnId === null
    ? null
    : (snapshot.transactions.admitted.get(turnId) ?? null)
}
