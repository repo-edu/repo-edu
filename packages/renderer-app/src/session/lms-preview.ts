import type { WorkflowResult } from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { useCallback, useReducer } from "react"
import { useCourseStore } from "../stores/course-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import type { SessionController } from "./session-controller.js"
import { useSessionController } from "./session-controller-context.js"

export type LmsPreviewWorkflow =
  | "roster.importFromLms"
  | "groupSet.connectFromLms"
  | "groupSet.syncFromLms"
export type LmsPreviewResult = WorkflowResult<LmsPreviewWorkflow>
/** Each preview workflow names the identifier it needs beyond the course. */
export type LmsPreviewTarget =
  | { workflow: "roster.importFromLms" }
  | { workflow: "groupSet.connectFromLms"; remoteGroupSetId: string }
  | { workflow: "groupSet.syncFromLms"; groupSetId: string }
export type LmsPreviewRequest = {
  course: PersistedCourse
  admissionNumber: number
}
export type LmsPreviewState =
  | { status: "idle" }
  | { status: "loading"; request: LmsPreviewRequest; message: string }
  | { status: "ready"; request: LmsPreviewRequest; result: LmsPreviewResult }
  | { status: "error"; message: string }
export type LmsPreviewEvent =
  | { type: "reset" }
  | { type: "start"; request: LmsPreviewRequest }
  | { type: "progress"; request: LmsPreviewRequest; message: string }
  | { type: "ready"; request: LmsPreviewRequest; result: LmsPreviewResult }
  | { type: "failed"; request: LmsPreviewRequest; message: string }
  | { type: "refused" }

export const staleLmsPreviewMessage =
  "The course changed. Refresh the preview before applying it."

function linkedLmsCourseId(course: PersistedCourse): string {
  if (course.lmsCourseId === null)
    throw new Error("The course is not linked to an LMS course.")
  return course.lmsCourseId
}

export function captureLmsPreview(courseId: string): LmsPreviewRequest {
  const { course, admissionNumber } = useCourseStore.getState()
  if (course?.id !== courseId) throw new Error(staleLmsPreviewMessage)
  return { course: structuredClone(course), admissionNumber }
}

export function lmsPreviewReducer(
  state: LmsPreviewState,
  event: LmsPreviewEvent,
): LmsPreviewState {
  if (event.type === "reset") return { status: "idle" }
  if (event.type === "start")
    return {
      status: "loading",
      request: event.request,
      message: "Connecting to LMS...",
    }
  if (event.type === "refused")
    return { status: "error", message: staleLmsPreviewMessage }
  if (state.status !== "loading" || state.request !== event.request)
    return state
  if (event.type === "progress") return { ...state, message: event.message }
  if (event.type === "failed")
    return { status: "error", message: event.message }
  return { status: "ready", request: event.request, result: event.result }
}

/** Transient request state is separate from the course store's apply admission. */
export function useLmsPreview() {
  const controller = useSessionController()
  const [state, dispatch] = useReducer(lmsPreviewReducer, { status: "idle" })
  const reset = useCallback(() => dispatch({ type: "reset" }), [])
  const preview = (target: LmsPreviewTarget, courseId: string) =>
    requestLmsPreview(controller, dispatch, target, courseId)
  const apply = (): LmsPreviewResult | null => {
    if (state.status !== "ready") return null
    if (
      !controller.applyLmsPreview(
        state.request.course.id,
        state.request.admissionNumber,
        state.result,
      )
    ) {
      dispatch({ type: "refused" })
      return null
    }
    reset()
    return state.result
  }
  return { state, preview, apply, reset }
}

export async function requestLmsPreview(
  controller: SessionController,
  dispatch: (event: LmsPreviewEvent) => void,
  target: LmsPreviewTarget,
  courseId: string,
) {
  let request: LmsPreviewRequest
  try {
    request = captureLmsPreview(courseId)
  } catch {
    dispatch({ type: "refused" })
    return
  }
  const reservation = controller.operations.reserve(target.workflow)
  if (reservation === null) return
  dispatch({ type: "start", request })
  await reservation
    .run(async (scope) => {
      try {
        const input = {
          course: request.course,
          credentials: controller.getSnapshot().settings.credentials,
        }
        const options = {
          onProgress: (progress: { label: string }) =>
            dispatch({ type: "progress", request, message: progress.label }),
        }
        const result = await (target.workflow === "roster.importFromLms"
          ? scope.run(
              target.workflow,
              { ...input, lmsCourseId: linkedLmsCourseId(request.course) },
              options,
            )
          : target.workflow === "groupSet.connectFromLms"
            ? scope.run(
                target.workflow,
                { ...input, remoteGroupSetId: target.remoteGroupSetId },
                options,
              )
            : scope.run(
                target.workflow,
                { ...input, groupSetId: target.groupSetId },
                options,
              ))
        scope.publish(() => dispatch({ type: "ready", request, result }))
      } catch (error) {
        if (scope.canContinue())
          scope.publish(() =>
            dispatch({
              type: "failed",
              request,
              message: getErrorMessage(error),
            }),
          )
      }
    })
    .catch((error) =>
      dispatch({ type: "failed", request, message: getErrorMessage(error) }),
    )
}
