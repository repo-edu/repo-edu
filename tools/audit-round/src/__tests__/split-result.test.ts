import assert from "node:assert/strict"
import { test } from "node:test"
import { readMoveList, readPick } from "../move-list.js"
import { readSplitResult, splitResultLine } from "../split-result.js"
import { roundGrammarExample, roundGrammarExamples } from "./round-grammar.js"

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

test("the pick report reader accepts or refuses each grammar example as documented", () => {
  for (const entry of roundGrammarExamples("pick/")) {
    if (entry.outcome === "parsed")
      assert.doesNotThrow(() => readPick(entry.source), entry.id)
    else
      assert.throws(
        () => readPick(entry.source),
        { message: entry.refusal ?? "" },
        entry.id,
      )
  }
})

test("the final Pick: line decides the answer and can precede an indented replacement list", () => {
  const prose = "Pick: Answer 2 keeps the shared setup together."
  const report = `${prose}\nPick: 02`
  assert.deepEqual(readPick(report), { report, number: 2, document: null })

  const source = roundGrammarExample("move-list/no-split").source
  const indented = source
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
  const pick = readPick(`${prose}\nPick: none.\n\n${indented}`)
  assert.equal(pick.number, null)
  assert.equal(pick.report, `${prose}\nPick: none.`)
  assert.ok(pick.document)
  assert.deepEqual(readMoveList(pick.document), readMoveList(source))
})
