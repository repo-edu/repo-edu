import assert from "node:assert/strict"
import { appendFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { CodexUsageReader } from "../codex-usage.js"
import type { Feedback } from "../feedback.js"
import { fixture } from "./helpers.js"

test("usage reads keep an incomplete UTF-8 tail and never replay old measurements", async (t) => {
  const f = await fixture(t)
  const path = join(f.root, "rollout-session.jsonl")
  await writeFile(path, "old records are outside this invocation\n")
  const usage = new CodexUsageReader(f.root)
  t.after(() => usage.close())
  await usage.prepareResume("session")
  const feedback: Feedback[] = []
  const observe = async (value: Feedback) => {
    feedback.push(value)
  }
  const model = Buffer.from(
    '{"type":"turn_context","payload":{"model":"modèle","effort":"high"}}\n',
  )
  const splitAt = model.indexOf(Buffer.from("è")) + 1
  await appendFile(path, model.subarray(0, splitAt))
  await usage.read("session", observe)
  assert.deepEqual(feedback, [])
  await appendFile(path, model.subarray(splitAt))
  await usage.read("session", observe)
  assert.deepEqual(feedback, [
    { type: "model", selection: { model: "modèle", effort: "high" } },
  ])
  for (const tokens of [12000, 14000, 8000]) {
    await appendFile(
      path,
      `${JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: tokens }, model_context_window: 100000 } } })}\n`,
    )
    await usage.read("session", observe)
    assert.deepEqual(feedback.at(-1), {
      type: "context",
      tokens,
      window: 100000,
    })
  }
  await usage.read("session", observe, true)
  assert.equal(feedback.length, 4)
})

for (const text of [
  "invalid JSON\n",
  '{"type":"turn_context","payload":{"model":null}}\n',
  '{"type":"event_msg","payload":{"type":"token_count","info":{}}}\n',
  '{"type":"turn_context"',
]) {
  test(`usage fails on malformed or unfinished evidence: ${text.slice(0, 40)}`, async (t) => {
    const f = await fixture(t)
    await writeFile(join(f.root, "rollout-session.jsonl"), text)
    const usage = new CodexUsageReader(f.root)
    t.after(() => usage.close())
    await assert.rejects(usage.read("session", async () => {}, true))
  })
}

test("a missing live usage file may arrive later, but final or resumed absence fails", async (t) => {
  const f = await fixture(t)
  const usage = new CodexUsageReader(f.root)
  t.after(() => usage.close())
  await usage.read("session", async () => {})
  await assert.rejects(
    usage.read("session", async () => {}, true),
    /Cannot locate/,
  )
  await assert.rejects(usage.prepareResume("session"), /Cannot locate/)
})
