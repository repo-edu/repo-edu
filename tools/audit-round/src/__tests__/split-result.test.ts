import assert from "node:assert/strict"
import { test } from "node:test"
import { readSplitResult, splitResultLine } from "../split-result.js"
import { roundGrammarExamples } from "./round-grammar.js"

test("the round grammar's split-result examples are reader fixtures that the writer reproduces", () => {
  for (const example of roundGrammarExamples("split-result/")) {
    if (example.outcome === "parsed") {
      assert.equal(
        splitResultLine(readSplitResult(example.source)),
        example.source,
        example.id,
      )
    } else {
      assert.throws(
        () => readSplitResult(example.source),
        (error: unknown) =>
          error instanceof Error && error.message === example.refusal,
        example.id,
      )
    }
  }
})

test("a split result keeps a message across lines and refuses another shape", () => {
  const result = {
    result: "checks-failed",
    hash: "3b18e512dba79e4c8300dd08aeb37f8e728b8dad",
    message: "pnpm check failed:\nline one\nline two",
  } as const
  assert.deepEqual(readSplitResult(splitResultLine(result)), result)
  for (const [line, refusal] of [
    [
      'PHASE RESULT: {"status":"finished","reason":null}',
      "Split result line must open with SPLIT RESULT:",
    ],
    ["SPLIT RESULT: made", "Split result is not one JSON object"],
    [
      `SPLIT RESULT: ${JSON.stringify({ ...result, extra: 1 })}`,
      "Split result holds exactly the fields result, hash and message",
    ],
    [
      `SPLIT RESULT: ${JSON.stringify({ result: "made", message: "Made." })}`,
      "Split result hash must be forty lowercase hexadecimal characters",
    ],
  ] as const)
    assert.throws(
      () => readSplitResult(line),
      (error: unknown) => error instanceof Error && error.message === refusal,
      refusal,
    )
})
