import type {
  AppError,
  DiagnosticOutput,
  GroupSetConnectFromLmsInput,
  GroupSetFetchAvailableFromLmsInput,
  GroupSetSyncFromLmsInput,
  MilestoneProgress,
  VerifyLmsDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { createValidationAppError } from "../core.js"
import {
  isSharedAppError,
  normalizeProviderError,
  resolveAppSettingsSnapshot,
  resolveCourseSnapshot,
  resolveLmsDraft,
  throwIfAborted,
} from "../workflow-helpers.js"
import {
  applyFetchedGroupSetToCourse,
  connectedRemoteId,
  createConnectedGroupSet,
  generateLocalGroupSetId,
  lmsGroupSetRemoteId,
} from "./helpers.js"
import type { GroupSetWorkflowPorts } from "./ports.js"

export function createLmsGroupSetHandlers(
  ports: GroupSetWorkflowPorts,
): Pick<
  WorkflowHandlerMap<
    | "groupSet.fetchAvailableFromLms"
    | "groupSet.connectFromLms"
    | "groupSet.syncFromLms"
  >,
  | "groupSet.fetchAvailableFromLms"
  | "groupSet.connectFromLms"
  | "groupSet.syncFromLms"
> {
  return {
    "groupSet.fetchAvailableFromLms": async (
      input: GroupSetFetchAvailableFromLmsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      let providerForError: VerifyLmsDraftInput["provider"] = "canvas"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const draft = resolveLmsDraft(course, settings)
        providerForError = draft.provider

        if (course.lmsCourseId === null) {
          throw {
            type: "not-found",
            message: "Course does not have a selected LMS course ID.",
            resource: "course",
          } satisfies AppError
        }

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Fetching available LMS group sets.",
        })
        const available = await ports.lms.listGroupSets(
          draft,
          course.lmsCourseId,
          options?.signal,
        )

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "LMS group-set discovery complete.",
        })
        return available
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(error, providerForError, "listGroupSets")
      }
    },
    "groupSet.connectFromLms": async (
      input: GroupSetConnectFromLmsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 5
      let providerForError: VerifyLmsDraftInput["provider"] = "canvas"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const draft = resolveLmsDraft(course, settings)
        providerForError = draft.provider

        if (course.lmsCourseId === null) {
          throw {
            type: "not-found",
            message: "Course does not have a selected LMS course ID.",
            resource: "course",
          } satisfies AppError
        }

        const alreadyConnected = course.roster.groupSets.find(
          (groupSet) =>
            connectedRemoteId(groupSet.connection) === input.remoteGroupSetId,
        )
        if (alreadyConnected !== undefined) {
          throw createValidationAppError(
            "LMS group set is already connected.",
            [
              {
                path: "remoteGroupSetId",
                message: `LMS group set '${input.remoteGroupSetId}' is already connected as '${alreadyConnected.name}'.`,
              },
            ],
          )
        }

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Creating connected local group set.",
        })
        const localGroupSetId = generateLocalGroupSetId(course)
        const courseWithConnectedSet: PersistedCourse = {
          ...course,
          roster: {
            ...course.roster,
            groupSets: [
              ...course.roster.groupSets,
              createConnectedGroupSet(
                draft.provider,
                course.lmsCourseId,
                input.remoteGroupSetId,
                localGroupSetId,
              ),
            ],
          },
          updatedAt: new Date().toISOString(),
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Fetching LMS group set data.",
        })
        const fetched = await ports.lms.fetchGroupSet(
          draft,
          course.lmsCourseId,
          input.remoteGroupSetId,
          options?.signal,
          (message) => {
            options?.onProgress?.({
              step: 3,
              totalSteps,
              label: message,
            })
          },
        )

        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Applying LMS group-set patch to roster.",
        })
        const { nextCourse, nextGroupSet } = applyFetchedGroupSetToCourse(
          courseWithConnectedSet,
          localGroupSetId,
          fetched,
        )

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "LMS group-set connection complete.",
        })
        return { ...nextGroupSet, roster: nextCourse.roster }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(error, providerForError, "fetchGroupSet")
      }
    },
    "groupSet.syncFromLms": async (
      input: GroupSetSyncFromLmsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 4
      let providerForError: VerifyLmsDraftInput["provider"] = "canvas"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const draft = resolveLmsDraft(course, settings)
        providerForError = draft.provider

        if (course.lmsCourseId === null) {
          throw {
            type: "not-found",
            message: "Course does not have a selected LMS course ID.",
            resource: "course",
          } satisfies AppError
        }

        const remoteGroupSetId = lmsGroupSetRemoteId(input.groupSetId, course)

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Fetching LMS group set data.",
        })
        const fetched = await ports.lms.fetchGroupSet(
          draft,
          course.lmsCourseId,
          remoteGroupSetId,
          options?.signal,
          (message) => {
            options?.onProgress?.({
              step: 2,
              totalSteps,
              label: message,
            })
          },
        )

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Applying LMS group-set patch to roster.",
        })
        const { nextCourse, nextGroupSet } = applyFetchedGroupSetToCourse(
          course,
          input.groupSetId,
          fetched,
        )

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "LMS group-set sync complete.",
        })
        return { ...nextGroupSet, roster: nextCourse.roster }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(error, providerForError, "fetchGroupSet")
      }
    },
  }
}
