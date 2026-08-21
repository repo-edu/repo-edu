import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  activeStepEndMarker,
  activeStepStartMarker,
  buildCodingPrompt,
  markActivePlanStep,
} from "../coding-prompt.js"
import { testCodingRequest } from "./coding-test-plan.js"

describe("coding prompt", () => {
  it("keeps the whole plan and marks only the parser-owned active step", () => {
    const request = testCodingRequest()
    const marked = markActivePlanStep(request)
    const activeSource = request.plan.markdown.slice(
      request.plan.steps[1].sourceSpan.start.offset,
      request.plan.steps[1].sourceSpan.end.offset,
    )

    assert.match(marked, /1\. \*\*First step\.\*\*/)
    assert.match(
      marked,
      new RegExp(
        `${activeStepStartMarker}\\n${activeSource.replaceAll("*", "\\*")}`,
      ),
    )
    assert.equal(
      marked.match(new RegExp(activeStepStartMarker, "g"))?.length,
      1,
    )
    assert.equal(marked.match(new RegExp(activeStepEndMarker, "g"))?.length, 1)
  })

  it("fixes write, Git, plan, step, install and result boundaries", () => {
    const prompt = buildCodingPrompt(testCodingRequest())

    assert.match(prompt, /Work only inside the Repo Edu checkout at \/repo-edu/)
    assert.match(prompt, /Do not edit the plan checkout/)
    assert.match(
      prompt,
      /Do not work on an earlier or later implementation step/,
    )
    assert.match(prompt, /Do not create or switch branches/)
    assert.match(prompt, /Do not run Git commands that write state/)
    assert.match(prompt, /may run pnpm install/)
    assert.match(prompt, /only package check scripts and focused test files/)
    assert.match(prompt, /Never run root pnpm check or root pnpm test/)
    assert.match(
      prompt,
      /use live web search and open the selected source page/,
    )
    assert.match(prompt, /Never use a search-result snippet as evidence/)
    assert.match(prompt, /Do not return proof choices or proof results/)
  })

  it("rejects a missing active step", () => {
    assert.throws(
      () => buildCodingPrompt(testCodingRequest(3)),
      /does not contain implementation step 3/,
    )
  })
})
