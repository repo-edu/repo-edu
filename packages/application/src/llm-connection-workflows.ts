import type {
  AppError,
  ConnectionVerificationResult,
  DiagnosticOutput,
  MilestoneProgress,
  VerifyLlmDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { isAppError } from "@repo-edu/application-contract"
import { getVerifyDefaultSpec } from "@repo-edu/integrations-llm-catalog"
import type {
  LlmAuthMode,
  LlmProvider,
  LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { throwIfAborted, toCancelledAppError } from "./workflow-helpers.js"

export type LlmDraftConnection = {
  provider: LlmProvider
  authMode: LlmAuthMode
  apiKey: string
}

export type LlmConnectionWorkflowPorts = {
  createDraftLlmTextClient(draft: LlmDraftConnection): LlmTextClient
}

const VERIFY_PROMPT = "Reply with the single word: ok"

export function createLlmConnectionWorkflowHandlers(
  ports: LlmConnectionWorkflowPorts,
): Pick<
  WorkflowHandlerMap<"connection.verifyLlmDraft">,
  "connection.verifyLlmDraft"
> {
  return {
    "connection.verifyLlmDraft": async (
      input: VerifyLlmDraftInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ConnectionVerificationResult> => {
      const totalSteps = 3
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Preparing LLM connection verification request.",
        })

        const draft: LlmDraftConnection = {
          provider: input.provider,
          authMode: input.authMode,
          apiKey: input.apiKey,
        }

        const verifySpec = getVerifyDefaultSpec(input.provider)
        if (verifySpec === undefined) {
          throw {
            type: "validation",
            message: `No verification model is registered for provider '${input.provider}'.`,
            issues: [
              {
                path: "provider",
                message: `Catalog is missing a verifyDefault entry for ${input.provider}.`,
              },
            ],
          } satisfies AppError
        }

        const client = ports.createDraftLlmTextClient(draft)

        options?.onOutput?.({
          channel: "info",
          message: `Verifying ${input.provider} (${input.authMode}) connection.`,
        })
        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Sending verification prompt.",
        })

        const result = await client.generateText({
          spec: {
            provider: verifySpec.provider,
            family: verifySpec.family,
            modelId: verifySpec.modelId,
            effort: verifySpec.effort,
          },
          prompt: VERIFY_PROMPT,
          signal: options?.signal,
        })

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "LLM connection verification complete.",
        })

        return {
          verified: result.reply.trim().length > 0,
          checkedAt: new Date().toISOString(),
        }
      } catch (error) {
        throw normalizeLlmError(error)
      }
    },
  }
}

function normalizeLlmError(error: unknown): AppError {
  if (isAppError(error)) {
    return error
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return toCancelledAppError()
  }
  if (error instanceof LlmError) {
    return {
      type: "provider",
      message: error.message,
      provider: "llm",
      operation: "verifyLlmDraft",
      retryable: error.kind !== "auth",
    }
  }
  return {
    type: "provider",
    message: error instanceof Error ? error.message : String(error),
    provider: "llm",
    operation: "verifyLlmDraft",
    retryable: true,
  }
}
