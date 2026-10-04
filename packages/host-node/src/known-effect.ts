import { CommandOutcomeError } from "@repo-edu/application-contract"

/** A failed call has ended and nothing keeps running, so its failure is known
 * even when it completed some of its work first. An outcome the call already
 * proved passes through unchanged. */
export function knownEffectFailure(
  error: unknown,
): CommandOutcomeError<unknown> {
  if (error instanceof CommandOutcomeError) return error
  return new CommandOutcomeError({
    disposition: "completed",
    completion: {
      status: "failed",
      error: {
        type: "effect",
        message: error instanceof Error ? error.message : String(error),
      },
      result: null,
    },
  })
}
