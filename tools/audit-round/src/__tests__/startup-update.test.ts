import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { updateClis } from "../startup.js"
import { fixture } from "./helpers.js"

const now = () => new Date(2026, 8, 14, 12)

async function updateFixture(
  t: TestContext,
  scenario: Record<string, unknown> = {},
) {
  const f = await fixture(t, { version: "0.154.0", ...scenario })
  f.releaseLookup.mock.mockImplementation(async () =>
    Response.json({ tag_name: "rust-v0.154.0" }),
  )
  const cacheRoot = join(f.root, "cache")
  await mkdir(cacheRoot)
  await writeFile(join(cacheRoot, "claude"), "2026-09-14\n")
  const messages: string[] = []
  const warnings: string[] = []
  const output = {
    message: async (text: string) => {
      messages.push(text)
    },
    warning: async (text: string) => {
      warnings.push(text)
    },
  }
  return {
    ...f,
    cacheRoot,
    messages,
    warnings,
    output,
    run: (runtime = f.runtime) => updateClis(runtime, output, cacheRoot, now),
    stamp: () => readFile(join(cacheRoot, "codex"), "utf8"),
    updates: async () =>
      (await f.calls()).filter((call) => call.args[0] === "update"),
  }
}

for (const version of ["0.154.0", "0.154.0+build.1", "0.155.0"]) {
  test(`Codex ${version} skips installation when the channel is not newer`, async (t) => {
    const f = await updateFixture(t, { version })
    await f.run()
    assert.equal((await f.updates()).length, 0)
    assert.deepEqual(f.warnings, [])
    assert.match(
      f.messages.at(-1) ?? "",
      version === "0.155.0"
        ? /Codex 0.155.0 is newer.*0.154.0/
        : /Codex is up to date \(0.154.0\)/,
    )
    assert.equal(await f.stamp(), "2026-09-14\n")
    assert.equal(
      f.releaseLookup.mock.calls[0].arguments[0],
      "https://releases.openai.com/codex/channels/latest",
    )
    await f.run()
    assert.equal((await f.calls()).length, 1)
    assert.equal(f.releaseLookup.mock.callCount(), 1)
  })
}

for (const version of ["0.9.0", "0.154.0-alpha.2"]) {
  test(`Codex ${version} upgrades in semantic version order and verifies the result`, async (t) => {
    const f = await updateFixture(t, {
      version,
      updatedVersion: "0.154.0",
      updateOutput: "Update ran successfully! Please restart Codex.",
    })
    await f.run()
    assert.deepEqual(
      (await f.calls()).map((call) => call.args[0]),
      ["--version", "update", "--version"],
    )
    assert.equal(f.messages.at(-1), `Codex updated from ${version} to 0.154.0`)
    assert.doesNotMatch(f.messages.join("\n"), /Please restart Codex/)
    assert.deepEqual(f.warnings, [])
    assert.equal(await f.stamp(), "2026-09-14\n")
  })
}

test("an update reaching a newer release reports the version actually installed", async (t) => {
  const f = await updateFixture(t, {
    version: "0.153.0",
    updatedVersion: "0.155.0",
  })
  await f.run()
  assert.equal(f.messages.at(-1), "Codex updated from 0.153.0 to 0.155.0")
  assert.equal(await f.stamp(), "2026-09-14\n")
})

for (const updatedVersion of ["0.153.0", "0.152.0"]) {
  test(`an installer claiming success at ${updatedVersion} cannot stamp the check`, async (t) => {
    const f = await updateFixture(t, {
      version: "0.153.0",
      updatedVersion,
      updateOutput: "Codex CLI installed successfully.",
    })
    await f.run()
    assert.match(f.warnings[0], /update was not verified.*expected 0.154.0/)
    assert.doesNotMatch(f.messages.join("\n"), /Codex updated from/)
    assert.ok(
      f.messages.includes("Codex updater diagnostics (update not verified):"),
    )
    await assert.rejects(f.stamp(), { code: "ENOENT" })
    await f.configure({ version: "0.153.0", updatedVersion: "0.154.0" })
    await f.run()
    assert.equal((await f.updates()).length, 2)
    assert.equal(await f.stamp(), "2026-09-14\n")
  })
}

test("an updater failure retains stdout and stderr diagnostics and is retried", async (t) => {
  const f = await updateFixture(t, {
    version: "0.153.0",
    updateFail: "codex",
    updateOutput: "Downloading Codex CLI",
    updateStderr: "Download failed\n",
  })
  await f.run()
  assert.ok(f.messages.includes("Downloading Codex CLI"))
  assert.ok(f.messages.includes("Download failed"))
  assert.match(f.warnings[0], /codex update failed/)
  await assert.rejects(f.stamp(), { code: "ENOENT" })
})

for (const [label, response] of [
  ["HTTP failure", () => new Response("Unavailable", { status: 503 })],
  ["invalid JSON", () => new Response("not JSON")],
  ["missing release", () => Response.json({})],
  ["invalid release tag", () => Response.json({ tag_name: "0.154.0" })],
  ["invalid version", () => Response.json({ tag_name: "rust-v0.bad.0" })],
  [
    "network failure",
    () => {
      throw new TypeError("fetch failed")
    },
  ],
  [
    "timeout",
    () => {
      throw new DOMException("Timed out", "TimeoutError")
    },
  ],
] as const) {
  test(`release lookup ${label} skips the updater and retries next time`, async (t) => {
    const f = await updateFixture(t, { version: "0.153.0" })
    f.releaseLookup.mock.mockImplementation(async () => response())
    await f.run()
    assert.equal((await f.updates()).length, 0)
    assert.match(f.warnings[0], /Cannot check the latest Codex release/)
    await assert.rejects(f.stamp(), { code: "ENOENT" })
    f.releaseLookup.mock.mockImplementation(async () =>
      Response.json({ tag_name: "rust-v0.153.0" }),
    )
    await f.run()
    assert.equal(f.releaseLookup.mock.callCount(), 2)
    assert.equal(await f.stamp(), "2026-09-14\n")
  })
}

for (const scenario of [
  { versionOutput: "unrecognised" },
  { versionExit: 7 },
]) {
  test(`an unreadable installed version prevents an update: ${JSON.stringify(scenario)}`, async (t) => {
    const f = await updateFixture(t, scenario)
    await f.run()
    assert.equal((await f.updates()).length, 0)
    assert.equal(f.releaseLookup.mock.callCount(), 0)
    assert.equal(f.warnings.length, 1)
    await assert.rejects(f.stamp(), { code: "ENOENT" })
  })
}

test("cancellation during the release lookup stops startup without stamping or updating", async (t) => {
  const f = await updateFixture(t, { version: "0.153.0" })
  const controller = new AbortController()
  const reason = new Error("Interrupted")
  f.releaseLookup.mock.mockImplementation(async (_url, options) => {
    assert.ok(options?.signal)
    controller.abort(reason)
    options.signal.throwIfAborted()
    return Response.json({ tag_name: "rust-v0.154.0" })
  })
  await assert.rejects(
    f.run({ ...f.runtime, signal: controller.signal }),
    reason,
  )
  assert.deepEqual(f.warnings, [])
  assert.equal((await f.updates()).length, 0)
  await assert.rejects(f.stamp(), { code: "ENOENT" })
})

for (const message of [
  "Updating Codex from",
  "Codex updated from",
  "Codex is up to date",
]) {
  test(`a failed writer at '${message}' stops startup without stamping`, async (t) => {
    const f = await updateFixture(t, {
      version: message === "Codex is up to date" ? "0.154.0" : "0.153.0",
      updatedVersion: "0.154.0",
    })
    await assert.rejects(
      updateClis(
        f.runtime,
        {
          ...f.output,
          message: async (text) => {
            if (text.startsWith(message))
              throw new Error("Required write failed")
          },
        },
        f.cacheRoot,
        now,
      ),
      /Required write failed/,
    )
    assert.deepEqual(f.warnings, [])
    await assert.rejects(f.stamp(), { code: "ENOENT" })
  })
}
