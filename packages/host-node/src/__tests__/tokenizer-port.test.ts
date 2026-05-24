import assert from "node:assert/strict"
import { describe, it } from "node:test"
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
})
