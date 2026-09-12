import assert from "node:assert/strict"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { decodeCodexUsage } from "../codex-session.js"
import { recordContracts } from "../contract.js"
import { fixture, phaseStream, recorded } from "./helpers.js"

const terminal = { write: () => {}, status: () => {}, clear: () => {} }

test("contract recorder validates both real boundaries before replacing only its fixtures", async (t) => {
  const f = await fixture(t)
  const usage = (await recorded("codex-rollout.jsonl"))
    .trimEnd()
    .split("\n")
    .map((line) => {
      const event = JSON.parse(line)
      if (event.type === "event_msg") {
        event.payload.rate_limits = { plan_type: "unused-account-plan" }
        event.payload.info.total_token_usage = { input_tokens: 999999 }
        event.payload.info.last_token_usage.output_tokens = 123
      }
      return JSON.stringify(event)
    })
    .join("\n")
  await f.configure({
    assistants: {
      claude: { stream: await phaseStream("claude") },
      codex: {
        stream: await phaseStream("codex"),
        usage: {
          path: join(f.root, "rollout-test-session.jsonl"),
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
  await recordContracts("both", f.runtime, destination, terminal)
  assert.deepEqual((await readdir(destination)).sort(), [
    "README.md",
    "claude-version.txt",
    "claude.jsonl",
    "codex-rollout.jsonl",
    "codex-version.txt",
    "codex.jsonl",
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
    /instructions|cwd|sandbox_policy|rate_limits|total_token_usage|output_tokens/,
  )
  assert.deepEqual(
    (await readFile(join(destination, "codex-rollout.jsonl"), "utf8"))
      .trimEnd()
      .split("\n")
      .flatMap((line) => decodeCodexUsage(JSON.parse(line))),
    usage.split("\n").flatMap((line) => decodeCodexUsage(JSON.parse(line))),
  )
  const calls = await f.calls()
  assert.equal(calls.filter((call) => call.args[0] === "exec").length, 1)
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
    calls
      .find((call) => call.args[0] === "exec")
      .args.at(-1)
      .includes("Do not read or edit repository files"),
  )
})

test("failed second contract preserves both previous fixture sets", async (t) => {
  const f = await fixture(t)
  await f.configure({
    assistants: {
      claude: { stream: await phaseStream("claude") },
      codex: { exitCode: 7 },
    },
  })
  const destination = join(f.root, "fixtures")
  await mkdir(destination)
  for (const assistant of ["claude", "codex"])
    await writeFile(
      join(destination, `${assistant}.jsonl`),
      "previous recording",
    )
  await assert.rejects(
    recordContracts("both", f.runtime, destination, terminal),
    /codex contract failed/,
  )
  for (const assistant of ["claude", "codex"])
    assert.equal(
      await readFile(join(destination, `${assistant}.jsonl`), "utf8"),
      "previous recording",
    )
})

test("contract requires the intentional tool failure even when the phase reports success", async (t) => {
  const f = await fixture(t)
  const stream = (await phaseStream("claude"))
    .split("\n")
    .filter((line) => !line.includes('"type":"user"'))
    .join("\n")
  await f.configure({ stream })
  await assert.rejects(
    recordContracts("claude", f.runtime, join(f.root, "fixtures"), terminal),
    /missing evidence: failure, success/,
  )
})
