import assert from "node:assert/strict"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { decodeCodexUsage } from "../codex-session.js"
import { recordContracts } from "../contract.js"
import { fixture, recorded } from "./helpers.js"

const terminal = { write: () => {}, status: () => {}, clear: () => {} }

test("contract recorder validates all three assistants before replacing its fixtures", async (t) => {
  const f = await fixture(t)
  const usage = (await recorded("codex-rollout.jsonl"))
    .trimEnd()
    .split("\n")
    .map((line) => {
      const event = JSON.parse(line)
      if (event.type === "event_msg") {
        event.payload.rate_limits = { plan_type: "unused-account-plan" }
        event.payload.info.total_token_usage = {
          input_tokens: 999999,
          cached_input_tokens: 777777,
          output_tokens: 123,
        }
      }
      return JSON.stringify(event)
    })
    .join("\n")
  const stream = await recorded("codex.jsonl")
  const threadId = JSON.parse(stream.split("\n")[0]).thread_id
  const gemini = await recorded("gemini.jsonl")
  const geminiResume = await recorded("gemini-resume.jsonl")
  const events = gemini
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line))
  const init = events[0]
  assert.equal(init.event, "init")
  const result = events.at(-1)
  assert.equal(result.event, "result")
  // Restore fields and a finish step that the live recorder drops.
  Object.assign(init.init, { cwd: "/machine", tools: [], json_schema: {} })
  result.result.json_schema = {}
  events.splice(-1, 0, {
    event: "step_update",
    conversation_id: init.conversation_id,
    step_update: { step_type: "finish", state: "DONE" },
  })
  await f.configure({
    assistants: {
      claude: { stream: await recorded("claude.jsonl") },
      gemini: {
        stream: events.map((event) => JSON.stringify(event)).join("\n"),
        resumeStream: geminiResume,
      },
      codex: {
        stream,
        usage: {
          path: join(f.root, `rollout-${threadId}.jsonl`),
          text: `${usage}\n`,
        },
      },
    },
  })
  const destination = join(f.root, "fixtures")
  await mkdir(destination)
  await writeFile(
    join(destination, "README.md"),
    "Independent fixture ownership",
  )
  await recordContracts("all", f.runtime, destination, terminal)
  assert.deepEqual((await readdir(destination)).sort(), [
    "README.md",
    "claude-resume.jsonl",
    "claude-version.txt",
    "claude.jsonl",
    "codex-resume.jsonl",
    "codex-rollout-resume.jsonl",
    "codex-rollout.jsonl",
    "codex-version.txt",
    "codex.jsonl",
    "gemini-resume.jsonl",
    "gemini-version.txt",
    "gemini.jsonl",
    "recorded-at.txt",
  ])
  assert.equal(
    await readFile(join(destination, "README.md"), "utf8"),
    "Independent fixture ownership",
  )
  assert.match(
    await readFile(join(destination, "codex.jsonl"), "utf8"),
    /audit-round-probe-error/,
  )
  assert.doesNotMatch(
    await readFile(join(destination, "codex-rollout.jsonl"), "utf8"),
    /instructions|cwd|sandbox_policy|rate_limits/,
  )
  assert.match(
    await readFile(join(destination, "codex-rollout.jsonl"), "utf8"),
    /total_token_usage.*cached_input_tokens.*output_tokens/,
  )
  assert.deepEqual(
    (await readFile(join(destination, "codex-rollout.jsonl"), "utf8"))
      .trimEnd()
      .split("\n")
      .flatMap((line) => decodeCodexUsage(JSON.parse(line))),
    usage.split("\n").flatMap((line) => decodeCodexUsage(JSON.parse(line))),
  )
  const calls = await f.calls()
  assert.equal(
    await readFile(join(destination, "gemini.jsonl"), "utf8"),
    gemini,
  )
  assert.equal(
    await readFile(join(destination, "gemini-resume.jsonl"), "utf8"),
    geminiResume,
  )
  const prompts = (await f.prompts()).filter(
    (call) => call.assistant === "gemini",
  )
  assert.equal(prompts.length, 2)
  assert.match(prompts[0].prompt, /Use your shell tool twice/)
  assert.match(prompts[1].prompt, /audit-round-resume-probe/)
  assert.equal(
    prompts[1].args[prompts[1].args.indexOf("--conversation") + 1],
    init.conversation_id,
  )
  assert.equal(calls.filter((call) => call.args[0] === "exec").length, 2)
  assert.ok(
    calls
      .find((call) => call.args[0] === "exec")
      .args.includes("--approve-for-me"),
  )
  assert.equal(
    calls.some((call) => call.args[0] === "update"),
    false,
  )
  assert.ok(
    (await f.prompts())
      .find((call) => call.args[0] === "exec")
      .prompt.includes("Do not read or edit repository files"),
  )
  assert.ok(
    (await f.prompts())
      .filter((call) => call.args[0] === "exec")
      .some((call) => call.args.includes("resume")),
  )
})

test("Gemini needs the success probe's own output as well as a zero exit", async (t) => {
  const stream = (await recorded("gemini.jsonl")).replace(
    /audit-round-probe(?!-)/g,
    "audit-round-probe-error",
  )
  const f = await fixture(t, { stream })
  await assert.rejects(
    recordContracts("gemini", f.runtime, join(f.root, "fixtures"), terminal),
    /missing evidence: success/,
  )
})

test("a failed contract preserves all previous fixture sets", async (t) => {
  const f = await fixture(t)
  await f.configure({
    assistants: {
      claude: { stream: await recorded("claude.jsonl") },
      codex: { exitCode: 7 },
    },
  })
  const destination = join(f.root, "fixtures")
  await mkdir(destination)
  for (const assistant of ["claude", "codex", "gemini"])
    await writeFile(
      join(destination, `${assistant}.jsonl`),
      "previous recording",
    )
  await assert.rejects(
    recordContracts("all", f.runtime, destination, terminal),
    /codex contract failed/,
  )
  for (const assistant of ["claude", "codex", "gemini"])
    assert.equal(
      await readFile(join(destination, `${assistant}.jsonl`), "utf8"),
      "previous recording",
    )
})

test("contract requires the intentional tool failure even when the phase reports success", async (t) => {
  const f = await fixture(t)
  const stream = (await recorded("claude.jsonl"))
    .split("\n")
    .filter((line) => !line.includes('"type":"user"'))
    .join("\n")
  await f.configure({ stream })
  await assert.rejects(
    recordContracts("claude", f.runtime, join(f.root, "fixtures"), terminal),
    /missing evidence: failure, success/,
  )
})
