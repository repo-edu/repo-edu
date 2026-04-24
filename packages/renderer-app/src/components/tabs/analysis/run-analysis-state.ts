export type RunCompletionAction = "ignore" | "set-idle" | "commit-result"

/**
 * Resolve how a finished run should update UI state:
 * - stale (not current): ignore entirely
 * - current + aborted: move to idle
 * - current + completed: commit result
 */
export function resolveRunCompletionAction(
  isCurrentRun: boolean,
  aborted: boolean,
): RunCompletionAction {
  if (!isCurrentRun) return "ignore"
  if (aborted) return "set-idle"
  return "commit-result"
}
