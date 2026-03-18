import type {
  AssignmentValidationInput,
  RosterValidationInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  runValidateAssignmentForCourse,
  runValidateRosterForCourse,
} from "./core.js"
import { resolveCourseSnapshot, throwIfAborted } from "./workflow-helpers.js"

export function createValidationWorkflowHandlers(): Pick<
  WorkflowHandlerMap<"validation.roster" | "validation.assignment">,
  "validation.roster" | "validation.assignment"
> {
  return {
    "validation.roster": async (
      input: RosterValidationInput,
      options?: WorkflowCallOptions<never, never>,
    ) => {
      throwIfAborted(options?.signal)
      const course = resolveCourseSnapshot(input.course)
      return runValidateRosterForCourse(course)
    },
    "validation.assignment": async (
      input: AssignmentValidationInput,
      options?: WorkflowCallOptions<never, never>,
    ) => {
      throwIfAborted(options?.signal)
      const course = resolveCourseSnapshot(input.course)
      return runValidateAssignmentForCourse(course, input.assignmentId)
    },
  }
}
