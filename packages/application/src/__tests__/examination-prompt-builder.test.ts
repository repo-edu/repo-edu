import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildExaminationPrompt } from "../examination-workflows/prompt-builder.js"

describe("examination prompt builder", () => {
  it("uses backing-neutral examination wording", () => {
    const prompt = buildExaminationPrompt({
      anonymousContributorLabel: "Contributor 1",
      questionCount: 2,
      excerpts: [
        {
          sourceId: "E1",
          sourceDescriptor: "TypeScript",
          startLine: 1,
          lines: ["const answer = 42"],
        },
      ],
    })

    assert.match(prompt, /selected software project excerpts/)
    assert.doesNotMatch(prompt, /final repository state/)
  })
})
