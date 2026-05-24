import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { classifyCommentLines } from "../../analysis/index.js"
import { loadGrammarForTests } from "../helpers/load-tokenizer-language.js"

function assertCommentLines(actual: Set<number>, expected: readonly number[]) {
  assert.deepEqual([...actual], [...expected])
}

describe("classifyCommentLines", () => {
  it("classifies full-line C-family comments", async () => {
    const loaded = await loadGrammarForTests("ts")
    const lines = [
      "// this is a comment",
      "const x = 1",
      "  // indented comment",
    ]

    assertCommentLines(classifyCommentLines(lines, loaded), [0, 2])
  })

  it("classifies block comment continuation and blank lines", async () => {
    const loaded = await loadGrammarForTests("ts")
    const lines = ["/* start", " * middle", "", " */", "code"]

    assertCommentLines(classifyCommentLines(lines, loaded), [0, 1, 2, 3])
  })

  it("does not classify inline comments after code", async () => {
    const loaded = await loadGrammarForTests("ts")
    const lines = ["const x = 1 // inline comment"]

    assertCommentLines(classifyCommentLines(lines, loaded), [])
  })

  it("does not classify block-close-then-code on the same line", async () => {
    const loaded = await loadGrammarForTests("ts")
    const lines = ["/* block", "*/ const x = 1"]

    assertCommentLines(classifyCommentLines(lines, loaded), [0])
  })

  it("does not classify comment markers inside strings", async () => {
    const loaded = await loadGrammarForTests("ts")
    const lines = ['const url = "https://example.test"']

    assertCommentLines(classifyCommentLines(lines, loaded), [])
  })

  it("classifies Python docstrings and hash comments", async () => {
    const loaded = await loadGrammarForTests("py")
    const lines = ['r"""module docs"""', 'value = "# not comment"', "# comment"]

    assertCommentLines(classifyCommentLines(lines, loaded), [0, 2])
  })

  it("classifies Ruby block comments and hash comments", async () => {
    const loaded = await loadGrammarForTests("rb")
    const lines = ["=begin", "comment body", "=end", 'value = "# no"', "# yes"]

    assertCommentLines(classifyCommentLines(lines, loaded), [0, 1, 2, 4])
  })

  it("returns an empty set for empty input", async () => {
    const loaded = await loadGrammarForTests("ts")

    assertCommentLines(classifyCommentLines([], loaded), [])
  })
})
