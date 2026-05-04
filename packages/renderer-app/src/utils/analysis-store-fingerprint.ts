import type {
  AnalysisConfig,
  AnalysisRosterContext,
} from "@repo-edu/domain/analysis"

/**
 * Produces a string that changes whenever the analysis config or roster
 * identity changes. Used to detect stale per-repo results stored in the
 * in-session analysis store. Spurious differences only trigger a re-run,
 * which is cheap, so a plain JSON serialization suffices.
 */
export function buildAnalysisStoreFingerprint(
  config: AnalysisConfig,
  rosterContext: AnalysisRosterContext | undefined,
): string {
  return JSON.stringify({
    config,
    members: rosterContext?.members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
    })),
  })
}
