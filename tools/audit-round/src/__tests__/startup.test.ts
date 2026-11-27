import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { stopSignals } from "../cli-process.js"
import { prepareAssistants, updateClis } from "../startup.js"
import { testSettings } from "./configured-runner.js"
import { fixture } from "./helpers.js"

const now = () => new Date(2026, 8, 11, 12)

test("startup finishes daily updates before resolving Claude's model names", async (t) => {
  const f = await fixture(t, { releases: { opus: "claude-opus-5-5" } })
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
  const releases = await prepareAssistants(f.runtime, output, testSettings, {
    cacheRoot,
    now,
  })
  // Each Claude model the settings may pin reads as the release it resolves
  // to; neither CLI's own configuration is read.
  assert.deepEqual(releases, {
    claude: new Map([
      ["opus", "claude-opus-5-5"],
      ["claude-fable-5-1", "claude-fable-5-1"],
    ]),
    codex: new Map(),
    gemini: new Map(),
  })
  assert.deepEqual(
    (await f.calls()).map((call) => [
      call.assistant,
      call.args[0],
      call.args.includes("--model")
        ? call.args[call.args.indexOf("--model") + 1]
        : null,
    ]),
    [
      ["claude", "update", null],
      ["codex", "--version", null],
      ["gemini", "update", null],
      ["claude", "-p", "opus"],
      ["claude", "-p", "claude-fable-5-1"],
    ],
  )
  assert.equal(
    await readFile(join(cacheRoot, "claude"), "utf8"),
    "2026-09-11\n",
  )
  assert.equal(await readFile(join(cacheRoot, "codex"), "utf8"), "2026-09-11\n")
  await prepareAssistants(f.runtime, output, testSettings, { cacheRoot, now })
  assert.equal(
    (await f.calls()).filter((call) => call.args[0] === "update").length,
    2,
  )
  assert.ok(messages.includes("Codex is up to date (1.0.0)"))
  assert.equal(f.releaseLookup.mock.callCount(), 1)
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
  assert.ok(
    (await f.calls())
      .filter((call) => call.assistant === "claude" && call.args[0] === "-p")
      .every(
        (call) =>
          call.args[call.args.indexOf("--permission-mode") + 1] === "auto",
      ),
  )
})

test("a missing agy warns and its daily update remains due", async (t) => {
  const f = await fixture(t)
  const warnings: string[] = []
  const output = {
    message: async () => {},
    warning: async (text: string) => {
      warnings.push(text)
    },
  }
  const cache = join(f.root, "cache")
  const unavailable = {
    ...f.runtime,
    executables: {
      ...f.runtime.executables,
      gemini: { file: join(f.root, "missing-agy"), args: [] },
    },
  }
  await updateClis(unavailable, output, cache, now)
  assert.match(warnings.join("\n"), /gemini update failed/)
  await assert.rejects(readFile(join(cache, "gemini")), { code: "ENOENT" })
  await updateClis(f.runtime, output, cache, now)
  assert.deepEqual(
    (await f.calls()).map((call) => call.assistant),
    ["claude", "codex", "gemini"],
  )
  assert.equal(await readFile(join(cache, "gemini"), "utf8"), "2026-09-11\n")
})

test("only failed updates repeat and an unavailable cache warns", async (t) => {
  const f = await fixture(t, { version: "0.9.0", updateFail: "codex" })
  const warnings: string[] = []
  const output = {
    message: async () => {},
    warning: async (text: string) => {
      warnings.push(text)
    },
  }
  const cacheRoot = join(f.root, "cache")
  await updateClis(f.runtime, output, cacheRoot, now)
  await f.configure({ version: "0.9.0", updatedVersion: "1.0.0" })
  await updateClis(f.runtime, output, cacheRoot, now)
  assert.deepEqual(
    (await f.calls())
      .filter((call) => call.args[0] === "update")
      .map((call) => call.assistant),
    ["claude", "codex", "gemini", "codex"],
  )
  assert.ok(warnings.some((warning) => warning.includes("codex update failed")))
  const blocked = join(f.root, "blocked")
  await writeFile(blocked, "file")
  await updateClis(f.runtime, output, blocked, now)
  assert.ok(
    warnings.some((warning) => warning.includes("skipping update checks")),
  )
})

for (const mode of ["error", "exit", "missing"] as const) {
  test(`Claude failing to resolve a model name (${mode}) stops startup`, async (t) => {
    const f = await fixture(t, { settingsMode: mode })
    await assert.rejects(
      prepareAssistants(
        f.runtime,
        { message: async () => {}, warning: async () => {} },
        testSettings,
        {
          cacheRoot: join(f.root, "cache"),
          now,
        },
      ),
    )
  })
}

for (const signal of stopSignals) {
  test(`${signal} during an update stops startup without attempting the other CLI`, async (t) => {
    const f = await fixture(t, { updateWait: true })
    await assert.rejects(
      updateClis(
        f.runtime,
        {
          message: async (text) => {
            if (text === "claude update output") process.emit(signal)
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
}
