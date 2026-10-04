import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import { tokenizeSource } from "@repo-edu/domain/analysis"
import { createNodeTokenizerPort } from "../index.js"

describe("createNodeTokenizerPort", () => {
  it("loads pilot grammars through the production Node path", async () => {
    const port = createNodeTokenizerPort()

    for (const language of ["js", "py", "rb"] as const) {
      const loaded = await port.loadTokenizerLanguage(language)
      const tokens = tokenizeSource("# comment\n", loaded)

      assert.equal(loaded.language, language)
      assert.equal(tokens.length > 0, true)
    }
  })

  it("reports a grammar that cannot load as a known failure", async () => {
    const port = createNodeTokenizerPort()

    await assert.rejects(
      port.loadTokenizerLanguage("unknown-language" as never),
      (error: unknown) =>
        error instanceof CommandOutcomeError &&
        error.outcome.disposition === "completed",
    )
  })
})
