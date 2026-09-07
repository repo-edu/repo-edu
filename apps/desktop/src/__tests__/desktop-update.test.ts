import assert from "node:assert/strict"
import { it } from "node:test"
import { childProcessUnconfirmedTreeMessage } from "@repo-edu/host-node/child-process-lifetime"
import { runDesktopEntry } from "./desktop-entry-harness"
import { updateCollaborators } from "./desktop-update-collaborators"

for (const platform of ["win32", "linux", "darwin"] as const) {
  for (const source of ["renderer", "menu"] as const) {
    for (const ending of ["confirmed", "unconfirmed"] as const) {
      it(`${platform} ${source} restart drains before ${ending} ending and updater hand-off`, async () => {
        const result = await runDesktopEntry({
          platform,
          scenario: `${source}-${ending}`,
          collaborators: updateCollaborators(platform),
        })
        assert.equal(
          result.status,
          ending === "confirmed" ? 0 : 1,
          result.stderr,
        )
        const events = result.events
        assert.ok(events.includes("auto-install:false"))
        assert.ok(events.includes("phase:closing.draining"))
        const ordered = [
          "ordinary-started",
          "prepare-close",
          "ordinary-retired",
          "renderer-ready",
          "stop-owned-work",
          "ending-pending",
          ending,
          "close-storage",
        ]
        let previous = -1
        for (const event of ordered) {
          const index = events.indexOf(event)
          assert.ok(index > previous, `${event}: ${events.join(", ")}`)
          previous = index
        }
        assert.equal(
          events.filter((event) => event === "stop-owned-work").length,
          1,
        )
        assert.equal(events.includes("cancel-call"), false)
        if (ending === "confirmed") {
          const installation =
            platform === "win32"
              ? "updater-spawn"
              : platform === "linux"
                ? "updater-package-install"
                : "native-update-stage"
          assert.ok(
            events.indexOf(installation) > events.indexOf("close-storage"),
          )
          assert.ok(events.includes("quit-allowed"))
          assert.ok(events.includes("window-close-allowed"))
          assert.equal(events.includes("window-close-prevented"), false)
          assert.equal(events.includes("warning"), false)
          if (platform === "darwin") {
            assert.ok(events.includes("native-update-install"))
            assert.equal(events.includes("updater-spawn"), false)
          }
        } else {
          assert.equal(events.filter((event) => event === "warning").length, 1)
          assert.ok(events.includes(childProcessUnconfirmedTreeMessage))
          assert.equal(
            events.some(
              (event) =>
                event.startsWith("updater-") ||
                event.startsWith("native-update-"),
            ),
            false,
          )
          assert.equal(events.includes("quit-allowed"), false)
        }
        assert.deepEqual(events.slice(-2), [
          `process-exit:${result.status}`,
          "release",
        ])
      })
    }
  }
  for (const scenario of ["ordinary-close", "superseded"] as const) {
    it(`${platform} ${scenario} never starts installation`, async () => {
      const result = await runDesktopEntry({
        platform,
        scenario,
        collaborators: updateCollaborators(platform),
      })
      assert.equal(
        result.status,
        scenario === "ordinary-close" ? 0 : 1,
        result.stderr,
      )
      assert.equal(
        result.events.some(
          (event) =>
            event.startsWith("updater-") || event.startsWith("native-update-"),
        ),
        false,
      )
      assert.equal(
        result.events.filter((event) => event === "stop-owned-work").length,
        1,
      )
    })
  }
}

it("macOS hands an already staged update to the native updater without a child launch", async () => {
  const result = await runDesktopEntry({
    platform: "darwin",
    scenario: "mac-staged",
    collaborators: updateCollaborators("darwin"),
  })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(result.events.includes("native-update-install"))
  assert.equal(result.events.includes("native-update-stage"), false)
  assert.equal(result.events.includes("updater-spawn"), false)
})

it("an updater installation error exits without another owned-work stop", async () => {
  const result = await runDesktopEntry({
    platform: "linux",
    scenario: "install-error",
    collaborators: updateCollaborators("linux"),
  })
  assert.equal(result.status, 1, result.stderr)
  assert.ok(result.stderr.includes("update-failed"))
  assert.equal(
    result.events.filter((event) => event === "stop-owned-work").length,
    1,
  )
  assert.deepEqual(result.events.slice(-2), ["process-exit:1", "release"])
})
