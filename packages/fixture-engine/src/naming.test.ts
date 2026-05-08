import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { parseShortCode } from "@repo-edu/integrations-llm-catalog"
import { planPostfix, repoPostfix } from "./naming"

describe("repoPostfix", () => {
  test("encodes mixed Codex coder and Claude reviewer specs", () => {
    assert.equal(
      repoPostfix({
        coderSpec: parseShortCode("c542", "mc"),
        reviewerSpec: parseShortCode("31", "mc"),
        comments: 2,
        reviews: 1,
      }),
      "mc542-54-r31-47-o2",
    )
  })

  test("omits reviewer segment when no review rounds run", () => {
    assert.equal(
      repoPostfix({
        coderSpec: parseShortCode("c542", "mc"),
        reviewerSpec: parseShortCode("31", "mc"),
        comments: 2,
        reviews: 0,
      }),
      "mc542-54-o2",
    )
  })
})

describe("planPostfix", () => {
  test("encodes all axes including refactors", () => {
    assert.equal(
      planPostfix({
        plannerSpec: parseShortCode("33", "mp"),
        complexity: 2,
        students: 3,
        rounds: 6,
        reviews: 1,
        refactors: 2,
        coderInteraction: 2,
        style: "incremental",
      }),
      "i2-inc-s3-r6-w1-f2",
    )
  })

  test("emits f0 when no refactors are scheduled", () => {
    assert.equal(
      planPostfix({
        plannerSpec: parseShortCode("33", "mp"),
        complexity: 1,
        students: 2,
        rounds: 4,
        reviews: 0,
        refactors: 0,
        coderInteraction: 1,
        style: "big-bang",
      }),
      "i1-bb-s2-r4-w0-f0",
    )
  })
})
