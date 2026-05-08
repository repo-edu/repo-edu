import type { CommitKind } from "./plan-md"

/**
 * Build the per-slot kind sequence. Reviews are placed after a stratified
 * subset of build slots: the build timeline is partitioned into `reviews`
 * contiguous buckets of near-equal width, and one slot is picked uniformly
 * from the upper half of each bucket. Biasing toward bucket ends guarantees
 * the last review lands in the second half of the last bucket, so the
 * trailing build rounds also get reviewed, and reviews are spaced by at
 * least roughly half a bucket width.
 */
export function sampleKindSequence(
  buildRounds: number,
  reviews: number,
): CommitKind[] {
  const reviewAfter = new Set<number>()
  for (let k = 0; k < reviews; k++) {
    const start = Math.floor((k * buildRounds) / reviews)
    const end = Math.floor(((k + 1) * buildRounds) / reviews)
    const upperStart = start + Math.floor((end - start) / 2)
    const upperWidth = Math.max(1, end - upperStart)
    reviewAfter.add(upperStart + Math.floor(Math.random() * upperWidth))
  }
  const seq: CommitKind[] = []
  for (let i = 0; i < buildRounds; i++) {
    seq.push("build")
    if (reviewAfter.has(i)) seq.push("review")
  }
  return seq
}
