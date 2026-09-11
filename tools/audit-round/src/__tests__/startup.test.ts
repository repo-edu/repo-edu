import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { readClaudeSettings } from "../claude.js"
import { readCodexSettings } from "../codex-settings.js"
import { prepareAssistants, updateClis } from "../startup.js"
import { fixture } from "./helpers.js"

const now = () => new Date(2026, 8, 11, 12)

test("startup finishes daily updates before read-only settings discovery", async (t) => {
  const f = await fixture(t)
  const messages: string[] = []
  const output = {
    message: async (text: string) => {
      messages.push(text)
    },
    warning: async (text: string) => {
      messages.push(text)
    },
  }
  const cacheRoot = join(f.root, "cache")
  const selections = await prepareAssistants(f.runtime, output, {
    cacheRoot,
    now,
  })
  assert.deepEqual(selections, {
    claude: { model: "claude-model", effort: "high" },
    codex: { model: "chosen-model", effort: "high" },
  })
  assert.deepEqual(
    (await f.calls()).map((call) => [call.assistant, call.args[0]]),
    [
      ["claude", "update"],
      ["codex", "update"],
      ["claude", "-p"],
      ["codex", "app-server"],
    ],
  )
  assert.equal(
    await readFile(join(cacheRoot, "claude"), "utf8"),
    "2026-09-11\n",
  )
  assert.equal(await readFile(join(cacheRoot, "codex"), "utf8"), "2026-09-11\n")
  await prepareAssistants(f.runtime, output, { cacheRoot, now })
  assert.equal(
    (await f.calls()).filter((call) => call.args[0] === "update").length,
    2,
  )
  const requests = (await readFile(join(f.root, "requests.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  assert.ok(
    requests
      .filter(Array.isArray)
      .every(
        (request) =>
          request.length === 1 && request[0].type === "control_request",
      ),
  )
  assert.ok(
    requests
      .filter((request) => !Array.isArray(request))
      .every((request) => request.jsonrpc === undefined),
  )
  assert.ok(
    (await f.calls())
      .filter((call) => call.assistant === "claude" && call.args[0] === "-p")
      .every((call) => call.args.includes("--no-session-persistence")),
  )
})

test("only failed updates repeat and an unavailable cache warns", async (t) => {
  const f = await fixture(t, { updateFail: "codex" })
  const warnings: string[] = []
  const output = {
    message: async () => {},
    warning: async (text: string) => {
      warnings.push(text)
    },
  }
  const cacheRoot = join(f.root, "cache")
  await updateClis(f.runtime, output, cacheRoot, now)
  await f.configure({})
  await updateClis(f.runtime, output, cacheRoot, now)
  assert.deepEqual(
    (await f.calls()).map((call) => call.assistant),
    ["claude", "codex", "codex"],
  )
  assert.ok(warnings.some((warning) => warning.includes("codex update failed")))
  const blocked = join(f.root, "blocked")
  await writeFile(blocked, "file")
  await updateClis(f.runtime, output, blocked, now)
  assert.ok(
    warnings.some((warning) => warning.includes("skipping update checks")),
  )
})

for (const config of [
  { model: null, model_reasoning_effort: null },
  { model: "chosen-model", model_reasoning_effort: null },
  { model: null, model_reasoning_effort: "high" },
]) {
  test(`Codex resolves paginated defaults for ${JSON.stringify(config)}`, async (t) => {
    const f = await fixture(t, { config })
    assert.deepEqual(await readCodexSettings(f.runtime, async () => {}), {
      model: "chosen-model",
      effort: config.model_reasoning_effort ?? "xhigh",
    })
    const requests = (await readFile(join(f.root, "requests.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    assert.deepEqual(
      requests
        .filter((request) => request.method === "model/list")
        .map((request) => request.params),
      [{ includeHidden: true }, { includeHidden: true, cursor: "second-page" }],
    )
  })
}

test("Codex rejects an unresolved effort after searching every model page", async (t) => {
  const f = await fixture(t, {
    config: { model: "unlisted-model", model_reasoning_effort: null },
  })
  await assert.rejects(
    readCodexSettings(f.runtime, async () => {}),
    {
      message: "Codex did not report defaults for the selected model",
    },
  )
  const requests = (await readFile(join(f.root, "requests.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  assert.deepEqual(
    requests
      .filter((request) => request.method === "model/list")
      .map((request) => request.params),
    [{ includeHidden: true }, { includeHidden: true, cursor: "second-page" }],
  )
  const [call] = await f.calls()
  assert.throws(() => process.kill(call.pid, 0), { code: "ESRCH" })
})

for (const mode of ["error", "exit", "malformed"] as const) {
  test(`Codex settings ${mode} rejects pending requests and awaits the child`, async (t) => {
    const f = await fixture(t, { settingsMode: mode })
    await assert.rejects(readCodexSettings(f.runtime, async () => {}))
    const [call] = await f.calls()
    assert.throws(() => process.kill(call.pid, 0), { code: "ESRCH" })
  })
}

for (const mode of ["error", "exit", "missing"] as const) {
  test(`Claude settings ${mode} stops startup`, async (t) => {
    const f = await fixture(t, { settingsMode: mode })
    await assert.rejects(readClaudeSettings(f.runtime, async () => {}))
  })
}

test("Codex settings process failure overrides valid replies", async (t) => {
  const f = await fixture(t, { settingsExit: 7 })
  await assert.rejects(readCodexSettings(f.runtime, async () => {}))
})

test("Ctrl-C during an update stops startup without attempting the other CLI", async (t) => {
  const f = await fixture(t, { updateWait: true })
  await assert.rejects(
    updateClis(
      f.runtime,
      {
        message: async (text) => {
          if (text === "claude update output") process.emit("SIGINT")
        },
        warning: async () => {
          assert.fail("An interrupted update must not be retried")
        },
      },
      join(f.root, "cache"),
      now,
    ),
  )
  assert.equal((await f.calls()).length, 1)
})
