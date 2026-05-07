import type { CommitKind } from "./plan-md"

/**
 * Build the per-slot kind sequence. Reviews are placed after a stratified
 * subset of build slots: the build timeline is partitioned into `reviews`
 * contiguous buckets of near-equal width, and one slot per bucket is picked
 * uniformly. This is a soft spread hint — it does not guarantee a minimum
 * gap (the last slot of one bucket can sit next to the first slot of the
 * next), but it eliminates the worst-case clustering that uniform random
 * selection routinely produces.
 */
export function sampleKindSequence(
  buildRounds: number,
  reviews: number,
): CommitKind[] {
  const reviewAfter = new Set<number>()
  for (let k = 0; k < reviews; k++) {
    const start = Math.floor((k * buildRounds) / reviews)
    const end = Math.floor(((k + 1) * buildRounds) / reviews)
    const width = end - start
    reviewAfter.add(start + Math.floor(Math.random() * width))
  }
  const seq: CommitKind[] = []
  for (let i = 0; i < buildRounds; i++) {
    seq.push("build")
    if (reviewAfter.has(i)) seq.push("review")
  }
  return seq
}
