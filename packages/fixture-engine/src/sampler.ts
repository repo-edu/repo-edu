import type { CommitKind } from "./plan-md"

/**
 * Build the per-slot kind sequence. Reviews and refactors are inserted after
 * a stratified subset of build slots: the build timeline is partitioned into
 * `count` contiguous buckets of near-equal width, and one slot is picked
 * uniformly from the upper half of each bucket. Biasing toward bucket ends
 * guarantees the last pick lands in the second half of the last bucket, so
 * the trailing build rounds also get covered, and picks are spaced by at
 * least roughly half a bucket width.
 *
 * Reviews are placed first; refactors are placed second with the same
 * stratification but excluding indices already claimed by a review. When a
 * refactor's bucket is fully claimed by a review (e.g. a singleton bucket
 * whose only slot is a review), the pick is filled in a global second pass
 * from any remaining free build slot. The result is disjoint and exact:
 * `reviews` reviews and `refactors` refactors are always placed, provided
 * `reviews + refactors <= buildRounds` (the caller's responsibility); the
 * sampler throws otherwise as defense in depth.
 */
export function sampleKindSequence(
  buildRounds: number,
  reviews: number,
  refactors: number,
): CommitKind[] {
  const reviewAfter = stratifiedPicks(buildRounds, reviews, new Set())
  const refactorAfter = stratifiedPicks(buildRounds, refactors, reviewAfter)
  const seq: CommitKind[] = []
  for (let i = 0; i < buildRounds; i++) {
    seq.push("build")
    if (reviewAfter.has(i)) seq.push("review")
    else if (refactorAfter.has(i)) seq.push("refactor")
  }
  return seq
}

function stratifiedPicks(
  buildRounds: number,
  count: number,
  exclude: Set<number>,
): Set<number> {
  const out = new Set<number>()
  for (let k = 0; k < count; k++) {
    const start = Math.floor((k * buildRounds) / count)
    const end = Math.floor(((k + 1) * buildRounds) / count)
    const upperStart = start + Math.floor((end - start) / 2)
    const pick =
      pickFreeIndex(upperStart, end, exclude, out) ??
      pickFreeIndex(start, upperStart, exclude, out)
    if (pick !== null) out.add(pick)
  }
  if (out.size < count) topUpGlobally(out, buildRounds, count, exclude)
  if (out.size < count) {
    throw new Error(
      `sampleKindSequence: cannot place ${count} picks in ${buildRounds} build slot(s) with ${exclude.size} excluded (caller must enforce reviews + refactors ≤ rounds)`,
    )
  }
  return out
}

function pickFreeIndex(
  start: number,
  end: number,
  exclude: Set<number>,
  taken: Set<number>,
): number | null {
  const free: number[] = []
  for (let i = start; i < end; i++) {
    if (!exclude.has(i) && !taken.has(i)) free.push(i)
  }
  if (free.length === 0) return null
  return free[Math.floor(Math.random() * free.length)]
}

function topUpGlobally(
  taken: Set<number>,
  buildRounds: number,
  target: number,
  exclude: Set<number>,
): void {
  const free: number[] = []
  for (let i = 0; i < buildRounds; i++) {
    if (!exclude.has(i) && !taken.has(i)) free.push(i)
  }
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[free[i], free[j]] = [free[j], free[i]]
  }
  while (taken.size < target && free.length > 0) {
    taken.add(free.pop() as number)
  }
}
