import type {
  LmsCourseSummary as AppLmsCourseSummary,
  ConnectionVerificationResult,
  DiagnosticOutput,
  ListLmsCoursesDraftInput,
  MilestoneProgress,
  VerifyGitDraftInput,
  VerifyLmsDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import type { LmsClient } from "@repo-edu/integrations-lms-contract"
import {
  normalizeProviderError,
  optionalUserAgent,
  throwIfAborted,
} from "./workflow-helpers.js"

export type ConnectionVerificationPorts = {
  lms: Pick<LmsClient, "verifyConnection" | "listCourses">
  git: Pick<GitProviderClient, "verifyConnection">
}

export function createConnectionWorkflowHandlers(
  ports: ConnectionVerificationPorts,
): Pick<
  WorkflowHandlerMap<
    | "connection.verifyLmsDraft"
    | "connection.listLmsCoursesDraft"
    | "connection.verifyGitDraft"
  >,
  | "connection.verifyLmsDraft"
  | "connection.listLmsCoursesDraft"
  | "connection.verifyGitDraft"
> {
  return {
    "connection.verifyLmsDraft": async (
      input: VerifyLmsDraftInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ConnectionVerificationResult> => {
      const totalSteps = 3
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Preparing LMS connection verification request.",
        })

        const draft = {
          provider: input.provider,
          baseUrl: input.baseUrl,
          token: input.token,
          ...optionalUserAgent(input.userAgent),
        }

        options?.onOutput?.({
          channel: "info",
          message: `Verifying ${input.provider} LMS connection.`,
        })
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Verifying LMS credentials with provider.",
        })

        const result = await ports.lms.verifyConnection(draft, options?.signal)

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "LMS connection verification complete.",
        })

        return {
          verified: result.verified,
          checkedAt: new Date().toISOString(),
        }
      } catch (error) {
        throw normalizeProviderError(error, input.provider, "verifyConnection")
      }
    },
    "connection.listLmsCoursesDraft": async (
      input: ListLmsCoursesDraftInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<AppLmsCourseSummary[]> => {
      const totalSteps = 3
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Preparing LMS course list request.",
        })

        const draft = {
          provider: input.provider,
          baseUrl: input.baseUrl,
          token: input.token,
          ...optionalUserAgent(input.userAgent),
        }

        options?.onOutput?.({
          channel: "info",
          message: `Fetching available courses from ${input.provider}.`,
        })
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Fetching courses from LMS provider.",
        })

        const courses = await ports.lms.listCourses(draft, options?.signal)

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "LMS course list loaded.",
        })

        return courses
      } catch (error) {
        throw normalizeProviderError(error, input.provider, "listCourses")
      }
    },
    "connection.verifyGitDraft": async (
      input: VerifyGitDraftInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ConnectionVerificationResult> => {
      const totalSteps = 3
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Preparing Git connection verification request.",
        })

        const draft = {
          provider: input.provider,
          baseUrl: input.baseUrl,
          token: input.token,
        }

        options?.onOutput?.({
          channel: "info",
          message: `Verifying ${input.provider} Git connection.`,
        })
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Verifying Git credentials with provider.",
        })

        const result = await ports.git.verifyConnection(draft, options?.signal)

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Git connection verification complete.",
        })

        return {
          verified: result.verified,
          checkedAt: new Date().toISOString(),
        }
      } catch (error) {
        throw normalizeProviderError(error, input.provider, "verifyConnection")
      }
    },
  }
}
