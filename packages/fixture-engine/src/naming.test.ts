import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { parseShortCode } from "@repo-edu/integrations-llm-catalog"
import { repoPostfix } from "./naming"

describe("repoPostfix", () => {
  test("encodes mixed Codex coder and Claude reviewer specs", () => {
    assert.equal(
      repoPostfix({
        coderSpec: parseShortCode("c542", "mc"),
        reviewerSpec: parseShortCode("31", "mc"),
        comments: 2,
      }),
      "mc542-54-r31-47-o2",
    )
  })
})
