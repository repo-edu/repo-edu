import {
  type AppValidationIssue,
  type CommandFailure,
  CommandOutcomeError,
  isAppError,
  type WorkflowHandler,
  type WorkflowId,
} from "@repo-edu/application-contract"
import type { GitEffectFailure } from "@repo-edu/integrations-git-contract"

/** Call only at a workflow-owned boundary that has not started mutation. */
export function commandRefusal(error: CommandFailure): CommandOutcomeError {
  return new CommandOutcomeError({ disposition: "refused", error })
}

export function commandValidationError(
  message: string,
  issues: AppValidationIssue[],
): CommandOutcomeError {
  return commandRefusal({ type: "validation", message, issues })
}

/** A sequential workflow has awaited its previous effect before checking here. */
export function commandThrowIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new CommandOutcomeError({ disposition: "stopped", result: null })
}

/** These handlers only read outside data and compose an uncommitted value.
 * Their owner therefore proves absence of mutation independently of category. */
export function readOnlyCommand<K extends WorkflowId>(
  handler: WorkflowHandler<K>,
): WorkflowHandler<K> {
  return (input, options) => commandPreparation(() => handler(input, options))
}

export async function commandPreparation<T>(
  body: () => T | Promise<T>,
): Promise<T> {
  try {
    return await body()
  } catch (error) {
    if (error instanceof CommandOutcomeError) throw error
    if (isAppError(error)) {
      switch (error.type) {
        case "cancelled":
          throw new CommandOutcomeError({
            disposition: "stopped",
            result: null,
          })
        case "validation":
        case "not-found":
        case "conflict":
        case "provider":
          throw commandRefusal(error)
        case "persistence":
          if (error.operation === "read")
            throw commandRefusal({ type: "effect", message: error.message })
      }
    }
    if (error instanceof DOMException && error.name === "AbortError")
      throw new CommandOutcomeError({ disposition: "stopped", result: null })
    throw error
  }
}

/** Call only after the effect owner proved that its run ended. */
export function commandCompletedFailure(
  error: CommandFailure,
): CommandOutcomeError {
  return new CommandOutcomeError<never>({
    disposition: "completed",
    completion: { status: "failed", error, result: null },
  })
}

export function isGitEffectFailure(error: unknown): error is GitEffectFailure {
  return (
    error instanceof Error && "type" in error && error.type === "git-effect"
  )
}

/** The Git adapter owns request, response and sequential-stop proof. Only an
 * exclusive command calls this; ordinary calls normalise the same failure to
 * an `AppError`. */
export function rethrowGitEffectFailure(error: unknown): void {
  if (!isGitEffectFailure(error)) return
  if (error.disposition === "stopped") {
    throw new CommandOutcomeError({ disposition: "stopped", result: null })
  }
  throw commandCompletedFailure({ type: "effect", message: error.message })
}
