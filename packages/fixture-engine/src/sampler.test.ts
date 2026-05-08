import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, test } from "node:test"
import { sampleKindSequence } from "./sampler"

let originalRandom: typeof Math.random
function pinRandom(value: number): void {
  Math.random = () => value
}

function counts(seq: readonly string[]): {
  build: number
  review: number
  refactor: number
} {
  return {
    build: seq.filter((k) => k === "build").length,
    review: seq.filter((k) => k === "review").length,
    refactor: seq.filter((k) => k === "refactor").length,
  }
}

describe("sampleKindSequence", () => {
  beforeEach(() => {
    originalRandom = Math.random
  })
  afterEach(() => {
    Math.random = originalRandom
  })

  test("emits exactly N build slots", () => {
    const seq = sampleKindSequence(6, 0, 0)
    assert.equal(counts(seq).build, 6)
    assert.equal(seq.length, 6)
  })

  test("zero reviews and refactors yields all builds", () => {
    const seq = sampleKindSequence(4, 0, 0)
    assert.deepEqual(seq, ["build", "build", "build", "build"])
  })

  test("places reviews and refactors disjointly", () => {
    for (let trial = 0; trial < 20; trial++) {
      const seq = sampleKindSequence(8, 2, 2)
      const c = counts(seq)
      assert.equal(c.build, 8)
      assert.equal(c.review, 2)
      assert.equal(c.refactor, 2)
      // No two consecutive non-build slots: a build can have at most one of
      // {review, refactor} after it (disjoint by construction).
      let prevWasBuild = false
      for (const k of seq) {
        if (k === "build") prevWasBuild = true
        else {
          assert.ok(
            prevWasBuild,
            `non-build slot must follow a build, got sequence ${seq.join(",")}`,
          )
          prevWasBuild = false
        }
      }
    }
  })

  test("packs reviews and refactors that fully fill build slots", () => {
    const seq = sampleKindSequence(4, 2, 2)
    const c = counts(seq)
    assert.equal(c.build, 4)
    assert.equal(c.review, 2)
    assert.equal(c.refactor, 2)
    // Every build slot must have exactly one follower.
    assert.equal(seq.length, 8)
  })

  test("review-only configuration still works", () => {
    for (let trial = 0; trial < 10; trial++) {
      const seq = sampleKindSequence(6, 3, 0)
      const c = counts(seq)
      assert.equal(c.build, 6)
      assert.equal(c.review, 3)
      assert.equal(c.refactor, 0)
    }
  })

  test("refactor-only configuration still works", () => {
    for (let trial = 0; trial < 10; trial++) {
      const seq = sampleKindSequence(6, 0, 3)
      const c = counts(seq)
      assert.equal(c.build, 6)
      assert.equal(c.review, 0)
      assert.equal(c.refactor, 3)
    }
  })

  test("places exact counts when refactor buckets collide with review picks", () => {
    // Adversarial layout: 10 builds, 2 reviews, 8 refactors. With Math.random
    // pinned to 0, refactor buckets [2,3) and [7,8) are singletons fully
    // claimed by review picks; the global top-up pass must still find them
    // free indices so the final count is exactly 8.
    pinRandom(0)
    const seq = sampleKindSequence(10, 2, 8)
    const c = counts(seq)
    assert.equal(c.build, 10)
    assert.equal(c.review, 2)
    assert.equal(c.refactor, 8)
  })

  test("places exact counts when reviews + refactors fill every build slot", () => {
    pinRandom(0)
    for (const reviews of [0, 1, 3, 5, 10]) {
      const refactors = 10 - reviews
      const seq = sampleKindSequence(10, reviews, refactors)
      const c = counts(seq)
      assert.equal(c.build, 10, `builds for reviews=${reviews}`)
      assert.equal(c.review, reviews, `reviews for reviews=${reviews}`)
      assert.equal(c.refactor, refactors, `refactors for reviews=${reviews}`)
    }
  })

  test("throws when reviews + refactors exceed build rounds", () => {
    assert.throws(
      () => sampleKindSequence(3, 2, 2),
      /cannot place 2 picks in 3 build slot\(s\) with 2 excluded/,
    )
  })

  test("last review or refactor lands in the trailing half of the timeline", () => {
    // Stratified upper-half placement guarantees the final pick is in the
    // second half of the last bucket — i.e. reasonably late.
    for (let trial = 0; trial < 30; trial++) {
      const seq = sampleKindSequence(6, 1, 0)
      const lastReviewBuildIdx = trailingBuildIndexBefore(seq, "review")
      assert.ok(
        lastReviewBuildIdx >= 3,
        `review should land after build slot ≥ 3 (0-indexed), got ${lastReviewBuildIdx} in ${seq.join(",")}`,
      )
    }
  })
})

function trailingBuildIndexBefore(
  seq: readonly string[],
  target: string,
): number {
  let buildIdx = -1
  let lastBuildBeforeTarget = -1
  for (const k of seq) {
    if (k === "build") buildIdx++
    else if (k === target) lastBuildBeforeTarget = buildIdx
  }
  return lastBuildBeforeTarget
}
