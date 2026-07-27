import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  invokeRendererCloseHandler,
  runRendererCloseGate,
} from "../renderer-close.js"

const channels = {
  request: "request",
  cancel: "cancel",
  complete: "complete",
  cancelComplete: "cancel-complete",
}

function harness() {
  const enabled: boolean[] = []
  const sent: Array<{ channel: string; payload: { requestId: string } }> = []
  const listeners = new Map<string, Set<(response: unknown) => void>>()
  let timeout: (() => void) | null = null
  return {
    enabled,
    sent,
    emit(channel: string, response: unknown) {
      for (const listener of listeners.get(channel) ?? []) listener(response)
    },
    fireTimeout() {
      const callback = timeout
      timeout = null
      callback?.()
    },
    options: {
      requestId: "close-1",
      channels,
      target: {
        isUnavailable: () => false,
        setEnabled(value: boolean) {
          enabled.push(value)
        },
        send(channel: string, payload: { requestId: string }) {
          sent.push({ channel, payload })
        },
      },
      transport: {
        subscribe(channel: string, listener: (response: unknown) => void) {
          const channelListeners = listeners.get(channel) ?? new Set()
          channelListeners.add(listener)
          listeners.set(channel, channelListeners)
          return () => channelListeners.delete(listener)
        },
      },
      scheduler(callback: () => void) {
        timeout = callback
        return {
          cancel() {
            timeout = null
          },
        }
      },
    },
  }
}

describe("desktop renderer close gate", () => {
  it("refuses to acknowledge close before the renderer handler is ready", async () => {
    assert.deepEqual(await invokeRendererCloseHandler(null, "close-1"), {
      requestId: "close-1",
      ok: false,
      message: "The renderer session is not ready to close.",
    })
  })

  it("disables input before requesting close and leaves success disabled", async () => {
    const state = harness()
    const closing = runRendererCloseGate(state.options)
    assert.deepEqual(state.enabled, [false])
    assert.equal(state.sent[0]?.channel, channels.request)
    state.emit(channels.complete, { requestId: "close-1", ok: true })
    assert.equal(await closing, true)
    assert.deepEqual(state.enabled, [false])
  })

  it("re-enables input only after a matching failure response", async () => {
    const state = harness()
    const closing = runRendererCloseGate(state.options)
    state.emit(channels.complete, { requestId: "stale", ok: false })
    assert.deepEqual(state.enabled, [false])
    state.emit(channels.complete, {
      requestId: "close-1",
      ok: false,
      message: "failed",
    })
    assert.equal(await closing, false)
    assert.deepEqual(state.enabled, [false, true])
  })

  it("waits for matching cancellation acknowledgement after timeout", async () => {
    const state = harness()
    const closing = runRendererCloseGate(state.options)
    state.fireTimeout()
    assert.equal(state.sent.at(-1)?.channel, channels.cancel)
    state.emit(channels.cancelComplete, { requestId: "stale" })
    assert.deepEqual(state.enabled, [false])
    state.emit(channels.cancelComplete, { requestId: "close-1" })
    assert.equal(await closing, false)
    assert.deepEqual(state.enabled, [false, true])
  })

  it("force closes when the renderer cannot acknowledge cancellation", async () => {
    const state = harness()
    const closing = runRendererCloseGate(state.options)
    state.fireTimeout()
    assert.equal(state.sent.at(-1)?.channel, channels.cancel)
    state.fireTimeout()
    assert.equal(await closing, true)
    assert.deepEqual(state.enabled, [false])
  })
})
