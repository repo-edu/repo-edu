import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { it } from "node:test"
import { runDesktopEntry } from "./desktop-entry-harness"

for (const scenario of ["gate-first", "ready-first"]) {
  it(`installs pre-ready work before entry settlement and retains the gate through exit: ${scenario}`, async () => {
    const result = await runDesktopEntry({ scenario })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
    const before = (first: string, second: string) => {
      assert.ok(result.events.includes(first), first)
      assert.ok(
        result.events.indexOf(first) < result.events.indexOf(second),
        `${first} before ${second}: ${result.events}`,
      )
    }
    before("switch:password-store:basic", "single-instance")
    before("single-instance", "claim")
    for (const event of [
      "listen:second-instance",
      "listen:activate",
      "listen:window-all-closed",
      "listen:before-quit",
      "when-ready",
      "claim",
    ])
      before(event, "entry-settled")
    before("entry-settled", "ready")
    before("held", "storage")
    before("ready", "storage")
    before("restore", "focus")
    before("focus", "stop-owned-work")
    before("stop-owned-work", "app-exit:0")
    before("app-exit:0", "release")
    assert.equal(result.events.filter((event) => event === "release").length, 1)
    assert.equal(
      result.events.filter((event) => event.startsWith("process-exit:")).length,
      1,
    )
  })
}

it("fatal exit retains the held gate without running normal shutdown", async () => {
  const result = await runDesktopEntry({ scenario: "fatal-after-gate" })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /\[desktop\] fatal Error: held-gate failure/)
  assert.deepEqual(result.events.slice(-3), [
    "after-gate",
    "process-exit:1",
    "release",
  ])
  assert.equal(result.events.includes("stop-owned-work"), false)
})

it("fatal exit still ends the process when synchronous stderr logging fails", async () => {
  const result = await runDesktopEntry({
    product: `
      import { closeSync } from "node:fs"
      export function installDesktopApplication() {
        closeSync(2)
        throw new Error("closed stderr")
      }
    `,
  })
  assert.equal(result.status, 1)
  assert.deepEqual(result.events, ["process-exit:1"])
})

it("a second start exits before requesting the cross-program gate", async () => {
  const result = await runDesktopEntry({ scenario: "second-start" })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.events, [
    "switch:password-store:basic",
    "single-instance",
    "app-exit:0",
    "process-exit:0",
  ])
})

it("importing the product does not install or start the application", async () => {
  const result = await runDesktopEntry({ importOnly: true })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.events, ["entry-settled", "process-exit:0"])
})

for (const [source, product] of [
  [
    "product loading",
    `
    if (process.listenerCount("uncaughtException") !== 1) throw new Error("handler missing")
    trace("product-load")
    throw new Error("product failed")
    export function installDesktopApplication() { trace("unexpected installer") }
  `,
  ],
  [
    "installer",
    `
    if (process.listenerCount("uncaughtException") !== 1) throw new Error("handler missing")
    trace("product-load")
    export function installDesktopApplication() { throw new Error("product failed") }
  `,
  ],
  [
    "uncaught exception",
    `
    trace("product-load")
    export function installDesktopApplication() {
      setImmediate(() => { throw new Error("product failed") })
    }
  `,
  ],
] as const) {
  it(`logs synchronously and exits once when ${source} fails`, async () => {
    const result = await runDesktopEntry({ product })
    assert.equal(result.status, 1)
    assert.equal(result.signal, null)
    assert.match(result.stderr, /\[desktop\] fatal Error: product failed/)
    assert.equal(result.stderr.match(/\[desktop\] fatal/g)?.length, 1)
    assert.equal(
      result.events.filter((event) => event === "process-exit:1").length,
      1,
    )
    assert.equal(result.events.includes("product-load"), true)
    assert.equal(
      result.events.some((event) =>
        ["dialog", "stop-owned-work", "app-exit:1"].includes(event),
      ),
      false,
    )
    if (source !== "uncaught exception")
      assert.equal(result.events.includes("entry-settled"), false)
  })
}

it("a thrown real installer uses the fatal handler", async () => {
  const result = await runDesktopEntry({ scenario: "installer-failure" })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /\[desktop\] fatal Error: installer failed/)
  assert.deepEqual(result.events, [
    "switch:password-store:basic",
    "single-instance",
    "process-exit:1",
  ])
})

it("development and packaged metadata both enter through the fatal bootstrap", async () => {
  const root = new URL("../", import.meta.url)
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", root), "utf8"),
  )
  const builder = JSON.parse(
    await readFile(new URL("../electron-builder.json", root), "utf8"),
  )
  assert.equal(manifest.main, "./out/main/main.js")
  assert.equal(builder.extraMetadata.main, manifest.main)
  const entry = await readFile(new URL("main.ts", root), "utf8")
  assert.match(entry, /await import\("\.\/desktop-application"\)/)
  assert.equal(entry.match(/^import /gm)?.length, 1)
  assert.match(entry, /^import \{ writeSync \} from "node:fs"/)
})
