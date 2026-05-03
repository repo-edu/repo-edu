import type { CommitKind } from "./plan-md"

export function sampleKindSequence(
  buildRounds: number,
  reviews: number,
): CommitKind[] {
  const slots = Array.from({ length: buildRounds }, (_, i) => i)
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  const reviewAfter = new Set(slots.slice(0, reviews))
  const seq: CommitKind[] = []
  for (let i = 0; i < buildRounds; i++) {
    seq.push("build")
    if (reviewAfter.has(i)) seq.push("review")
  }
  return seq
}
