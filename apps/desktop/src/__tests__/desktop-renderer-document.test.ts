import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  flushTransport,
  startMessage,
  transportHarness,
} from "./desktop-transport-harness"

for (const rendererUrl of [
  "http://localhost:5173/",
  "file:///Applications/Repo%20Edu.app/Contents/Resources/app.asar/out/renderer/index.html",
]) {
  describe(`document authority at ${rendererUrl}`, () => {
    it("admits only the initial committed main document", async () => {
      const calls: unknown[] = []
      const h = transportHarness(async (input) => {
        calls.push(input)
      }, rendererUrl)
      h.admission.dispatch({ type: "bootstrap-acknowledged" })
      h.invoke({ action: "setNativeTheme", input: "dark" })
      h.receive(startMessage("course.list", undefined))
      await flushTransport()
      assert.equal(h.direct.length, 1)
      assert.deepEqual(calls, [undefined])
      assert.deepEqual(h.effects, [])
    })

    it("does not authorise a URL before its host-owned load", () => {
      const h = transportHarness(async () => assert.fail(), rendererUrl, false)
      h.invoke({ action: "bootstrapReady" })
      assert.equal(h.effects.length, 1)
      assert.deepEqual(h.direct, [])
    })

    it("rejects a replacement frame even at the original URL", () => {
      const h = transportHarness(async () => assert.fail(), rendererUrl)
      h.contents.mainFrame = { ...h.contents.mainFrame }
      h.invoke({ action: "setNativeTheme", input: "dark" }, {
        ...h.event,
        senderFrame: h.contents.mainFrame,
      } as typeof h.event)
      assert.equal(h.effects.length, 1)
      assert.deepEqual(h.direct, [])
    })

    for (const [name, invalidate] of Object.entries({
      "main-frame navigation": (h: ReturnType<typeof transportHarness>) => {
        let prevented = false
        h.contents.emit("will-navigate", {
          preventDefault() {
            prevented = true
          },
        })
        assert.equal(prevented, true)
      },
      redirect: (h: ReturnType<typeof transportHarness>) => {
        let prevented = false
        h.contents.emit("will-redirect", {
          isMainFrame: true,
          preventDefault() {
            prevented = true
          },
        })
        assert.equal(prevented, true)
      },
      reload: (h: ReturnType<typeof transportHarness>) => {
        h.contents.emit("did-start-navigation", {
          url: rendererUrl,
          isMainFrame: true,
          isSameDocument: false,
        })
      },
      "URL change": (h: ReturnType<typeof transportHarness>) => {
        h.contents.emit(
          "did-navigate-in-page",
          {},
          `${rendererUrl}#changed`,
          true,
        )
      },
      "replacement commit": (h: ReturnType<typeof transportHarness>) => {
        h.contents.emit("did-frame-navigate", {}, rendererUrl, 200, "OK", true)
      },
      "renderer-created window": (h: ReturnType<typeof transportHarness>) => {
        assert.deepEqual(h.contents.openWindow(), { action: "deny" })
      },
      "second host load": (h: ReturnType<typeof transportHarness>) => {
        void h.gateway.loadRenderer()
      },
    })) {
      it(`${name} revokes authority before any later entry`, async () => {
        const h = transportHarness(
          async () => assert.fail("Workflow entered"),
          rendererUrl,
        )
        const events: unknown[] = []
        const dispatch = h.admission.dispatch.bind(h.admission)
        h.admission.dispatch = (event) => {
          events.push(event)
          return dispatch(event)
        }
        invalidate(h)
        invalidate(h)
        h.invoke({ action: "pickDirectory" })
        h.receive(startMessage("course.list", undefined))
        await flushTransport()
        assert.equal(events.length, 1)
        assert.equal(h.effects.length, 1)
        assert.deepEqual(h.direct, [])
        assert.deepEqual(h.responses, [])
      })
    }

    it("child navigation never grants child-frame authority", () => {
      const h = transportHarness(async () => assert.fail(), rendererUrl)
      h.contents.emit("did-start-navigation", { isMainFrame: false })
      h.contents.emit("will-redirect", { isMainFrame: false })
      h.contents.emit("did-frame-navigate", {}, rendererUrl, 200, "OK", false)
      h.contents.emit("did-navigate-in-page", {}, rendererUrl, false)
      assert.deepEqual(h.effects, [])
      h.invoke({ action: "pickDirectory" }, {
        ...h.event,
        senderFrame: { ...h.contents.mainFrame, parent: h.contents.mainFrame },
      } as typeof h.event)
      assert.equal(h.effects.length, 1)
      assert.deepEqual(h.direct, [])
    })

    for (const message of [
      null,
      { action: "unknown" },
      { action: "openExternalUrl", input: "https://example.com" },
      { action: "pickDirectory", input: { path: "/private" } },
      { action: "setNativeTheme", input: "invalid" },
      { action: "downloadUpdate", extra: true },
    ]) {
      it(`rejects ${JSON.stringify(message)} before shell work`, () => {
        const h = transportHarness(async () => assert.fail(), rendererUrl)
        h.invoke(message)
        assert.equal(h.effects.length, 1)
        assert.deepEqual(h.direct, [])
      })
    }
  })
}
