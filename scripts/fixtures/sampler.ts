import type { CommitKind } from "./plan-md"

export function sampleKindSequence(
  buildRounds: number,
  frequencyPct: number,
): CommitKind[] {
  const p = frequencyPct / 100
  const seq: CommitKind[] = []
  for (let i = 0; i < buildRounds; i++) {
    seq.push("build")
    if (Math.random() < p) seq.push("review")
  }
  return seq
}
