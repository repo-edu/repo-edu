import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createNodeHttpPort } from "../index.js"

describe("createNodeHttpPort", () => {
  it("passes request fields through to global fetch and returns normalized response", async () => {
    const originalFetch = globalThis.fetch
    const requests: Array<{ input: string; init: RequestInit | undefined }> = []

    ;(globalThis as { fetch: typeof globalThis.fetch }).fetch = (async (
      input,
      init,
    ) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      requests.push({ input: url, init })
      return new Response("accepted", {
        status: 202,
        statusText: "Accepted",
        headers: { "x-test-header": "ok" },
      })
    }) as typeof globalThis.fetch

    try {
      const httpPort = createNodeHttpPort()
      const controller = new AbortController()
      const result = await httpPort.fetch({
        url: "https://example.test/repositories",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"name":"repo-edu"}',
        signal: controller.signal,
      })

      assert.equal(requests.length, 1)
      assert.equal(requests[0].input, "https://example.test/repositories")
      assert.equal(requests[0].init?.method, "POST")
      assert.equal(requests[0].init?.body, '{"name":"repo-edu"}')
      assert.deepStrictEqual(requests[0].init?.headers, {
        "content-type": "application/json",
      })
      assert.equal(requests[0].init?.signal, controller.signal)

      assert.deepStrictEqual(result, {
        status: 202,
        statusText: "Accepted",
        headers: {
          "content-type": "text/plain;charset=UTF-8",
          "x-test-header": "ok",
        },
        body: "accepted",
      })
    } finally {
      ;(globalThis as { fetch: typeof globalThis.fetch }).fetch = originalFetch
    }
  })

  it("defaults the method to GET when request.method is omitted", async () => {
    const originalFetch = globalThis.fetch
    let capturedMethod: string | undefined

    ;(globalThis as { fetch: typeof globalThis.fetch }).fetch = (async (
      _input,
      init,
    ) => {
      capturedMethod = init?.method
      return new Response("", {
        status: 200,
        statusText: "OK",
      })
    }) as typeof globalThis.fetch

    try {
      const httpPort = createNodeHttpPort()
      const result = await httpPort.fetch({
        url: "https://example.test/health",
      })

      assert.equal(capturedMethod, "GET")
      assert.equal(result.status, 200)
      assert.equal(result.statusText, "OK")
      assert.equal(result.body, "")
    } finally {
      ;(globalThis as { fetch: typeof globalThis.fetch }).fetch = originalFetch
    }
  })
})
