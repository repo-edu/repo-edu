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
import type { LlmTextClient } from "@repo-edu/integrations-llm-contract"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { createValidationAppError } from "./core.js"
import { throwIfAborted, toCancelledAppError } from "./workflow-helpers.js"

export type LlmDraftConnection = VerifyLlmDraftInput

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

        const draft = validateLlmDraftInput(input)

        const verifySpec = getVerifyDefaultSpec(draft.provider)
        if (verifySpec === undefined) {
          throw createValidationAppError(
            `No verification model is registered for provider '${draft.provider}'.`,
            [
              {
                path: "provider",
                message: `Catalog is missing a verifyDefault entry for ${draft.provider}.`,
              },
            ],
          )
        }

        const client = ports.createDraftLlmTextClient(draft)

        options?.onOutput?.({
          channel: "info",
          message: `Verifying ${draft.provider} (${draft.authMode}) connection.`,
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

function validateLlmDraftInput(input: unknown): LlmDraftConnection {
  const issues: Parameters<typeof createValidationAppError>[1] = []
  if (!isRecord(input)) {
    throw createValidationAppError("LLM draft input is invalid.", [
      { path: "input", message: "Input must be an object." },
    ])
  }

  const provider = readProvider(input.provider, issues)
  const authMode = readAuthMode(input.authMode, issues)
  const apiKey = readApiKey(input.apiKey, issues)
  if (provider === null || authMode === null || apiKey === null) {
    throw createValidationAppError("LLM draft input is invalid.", issues)
  }

  if (authMode === "subscription") {
    if (apiKey !== "") {
      issues.push({
        path: "apiKey",
        message: "Subscription LLM connections must not include an API key.",
      })
    }
    if ("maxTokens" in input) {
      issues.push({
        path: "maxTokens",
        message: "maxTokens is only valid for Claude API-key LLM connections.",
      })
    }
    if (issues.length > 0) {
      throw createValidationAppError("LLM draft input is invalid.", issues)
    }
    return { provider, authMode: "subscription", apiKey: "" }
  }

  if (apiKey.trim().length === 0) {
    issues.push({
      path: "apiKey",
      message: "API-key LLM connections require a non-empty API key.",
    })
  }

  if (provider === "claude") {
    const maxTokens = input.maxTokens
    const validMaxTokens =
      typeof maxTokens === "number" &&
      Number.isInteger(maxTokens) &&
      maxTokens > 0
        ? maxTokens
        : null
    if (validMaxTokens === null) {
      issues.push({
        path: "maxTokens",
        message: "Claude API-key LLM connections require positive maxTokens.",
      })
    }
    if (issues.length > 0 || validMaxTokens === null) {
      throw createValidationAppError("LLM draft input is invalid.", issues)
    }
    return {
      provider: "claude",
      authMode: "api",
      apiKey,
      maxTokens: validMaxTokens,
    }
  }

  if ("maxTokens" in input) {
    issues.push({
      path: "maxTokens",
      message: "Codex API-key LLM connections must not include maxTokens.",
    })
  }
  if (issues.length > 0) {
    throw createValidationAppError("LLM draft input is invalid.", issues)
  }
  return { provider: "codex", authMode: "api", apiKey }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readProvider(
  value: unknown,
  issues: Parameters<typeof createValidationAppError>[1],
): LlmDraftConnection["provider"] | null {
  if (value === "claude" || value === "codex") return value
  issues.push({
    path: "provider",
    message: "LLM provider must be 'claude' or 'codex'.",
  })
  return null
}

function readAuthMode(
  value: unknown,
  issues: Parameters<typeof createValidationAppError>[1],
): LlmDraftConnection["authMode"] | null {
  if (value === "subscription" || value === "api") return value
  issues.push({
    path: "authMode",
    message: "LLM auth mode must be 'subscription' or 'api'.",
  })
  return null
}

function readApiKey(
  value: unknown,
  issues: Parameters<typeof createValidationAppError>[1],
): string | null {
  if (typeof value === "string") return value
  issues.push({
    path: "apiKey",
    message: "LLM API key must be a string.",
  })
  return null
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
