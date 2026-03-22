import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { HttpPort, HttpResponse } from "@repo-edu/host-runtime-contract"
import type { LmsConnectionDraft } from "@repo-edu/integrations-lms-contract"
import { createCanvasClient } from "../canvas/index.js"
import { createMoodleClient } from "../moodle/index.js"

const canvasDraft: LmsConnectionDraft = {
  provider: "canvas",
  baseUrl: "https://canvas.example.com",
  token: "canvas-token",
}

const moodleDraft: LmsConnectionDraft = {
  provider: "moodle",
  baseUrl: "https://moodle.example.com",
  token: "moodle-token",
}

function createStatusHttpPort(status: number, body = "{}"): HttpPort {
  return {
    async fetch(): Promise<HttpResponse> {
      return {
        status,
        statusText: status < 300 ? "OK" : "Error",
        headers: { "content-type": "application/json" },
        body,
      }
    },
  }
}

function createNetworkErrorHttpPort(message = "Connection refused"): HttpPort {
  return {
    async fetch(): Promise<HttpResponse> {
      throw new Error(message)
    },
  }
}

function createAbortedHttpPort(): HttpPort {
  return {
    async fetch(
      request: Parameters<HttpPort["fetch"]>[0],
    ): Promise<HttpResponse> {
      if (request.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError")
      }
      return {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: "[]",
      }
    },
  }
}

describe("Canvas error paths", () => {
  describe("verifyConnection", () => {
    it("returns verified: false on 401", async () => {
      const client = createCanvasClient(
        createStatusHttpPort(
          401,
          JSON.stringify({ errors: [{ message: "Invalid access token" }] }),
        ),
      )
      const result = await client.verifyConnection(canvasDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on 403", async () => {
      const client = createCanvasClient(createStatusHttpPort(403))
      const result = await client.verifyConnection(canvasDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on 429", async () => {
      const client = createCanvasClient(createStatusHttpPort(429))
      const result = await client.verifyConnection(canvasDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on network error", async () => {
      const client = createCanvasClient(createNetworkErrorHttpPort())
      const result = await client.verifyConnection(canvasDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on 500", async () => {
      const client = createCanvasClient(createStatusHttpPort(500))
      const result = await client.verifyConnection(canvasDraft)
      assert.deepEqual(result, { verified: false })
    })
  })

  describe("listCourses", () => {
    it("throws on 401", async () => {
      const client = createCanvasClient(
        createStatusHttpPort(
          401,
          JSON.stringify({ errors: [{ message: "Unauthorized" }] }),
        ),
      )
      await assert.rejects(
        () => client.listCourses(canvasDraft),
        (error: Error) => {
          assert.ok(error.message.includes("401"))
          return true
        },
      )
    })

    it("throws on 500", async () => {
      const client = createCanvasClient(createStatusHttpPort(500))
      await assert.rejects(
        () => client.listCourses(canvasDraft),
        (error: Error) => {
          assert.ok(error.message.includes("500"))
          return true
        },
      )
    })

    it("throws on 429", async () => {
      const client = createCanvasClient(createStatusHttpPort(429))
      await assert.rejects(
        () => client.listCourses(canvasDraft),
        (error: Error) => {
          assert.ok(error.message.includes("429"))
          return true
        },
      )
    })

    it("throws on network error", async () => {
      const client = createCanvasClient(createNetworkErrorHttpPort())
      await assert.rejects(() => client.listCourses(canvasDraft))
    })

    it("throws on aborted signal", async () => {
      const controller = new AbortController()
      controller.abort()
      const client = createCanvasClient(createAbortedHttpPort())
      await assert.rejects(() =>
        client.listCourses(canvasDraft, controller.signal),
      )
    })
  })

  describe("fetchRoster", () => {
    it("throws on 401 during enrollment fetch", async () => {
      const client = createCanvasClient(createStatusHttpPort(401))
      await assert.rejects(
        () => client.fetchRoster(canvasDraft, "course-1"),
        (error: Error) => {
          assert.ok(error.message.includes("401"))
          return true
        },
      )
    })

    it("throws on network error", async () => {
      const client = createCanvasClient(createNetworkErrorHttpPort())
      await assert.rejects(() => client.fetchRoster(canvasDraft, "course-1"))
    })
  })
})

describe("Moodle error paths", () => {
  describe("verifyConnection", () => {
    it("returns verified: false on moodle exception response", async () => {
      const client = createMoodleClient(
        createStatusHttpPort(
          200,
          JSON.stringify({
            exception: "moodle_exception",
            errorcode: "invalidtoken",
            message: "Invalid token",
          }),
        ),
      )
      const result = await client.verifyConnection(moodleDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on 500", async () => {
      const client = createMoodleClient(createStatusHttpPort(500))
      const result = await client.verifyConnection(moodleDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on 429", async () => {
      const client = createMoodleClient(createStatusHttpPort(429))
      const result = await client.verifyConnection(moodleDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on network error", async () => {
      const client = createMoodleClient(createNetworkErrorHttpPort())
      const result = await client.verifyConnection(moodleDraft)
      assert.deepEqual(result, { verified: false })
    })
  })

  describe("listCourses", () => {
    it("throws on moodle exception response", async () => {
      const client = createMoodleClient(
        createStatusHttpPort(
          200,
          JSON.stringify({
            exception: "moodle_exception",
            errorcode: "invalidtoken",
            message: "Invalid token",
          }),
        ),
      )
      await assert.rejects(
        () => client.listCourses(moodleDraft),
        (error: Error) => {
          assert.ok(error.message.includes("core_course_get_courses"))
          return true
        },
      )
    })

    it("throws on 500", async () => {
      const client = createMoodleClient(createStatusHttpPort(500))
      await assert.rejects(() => client.listCourses(moodleDraft))
    })

    it("throws on 429", async () => {
      const client = createMoodleClient(createStatusHttpPort(429))
      await assert.rejects(() => client.listCourses(moodleDraft))
    })

    it("throws on network error", async () => {
      const client = createMoodleClient(createNetworkErrorHttpPort())
      await assert.rejects(() => client.listCourses(moodleDraft))
    })

    it("throws on aborted signal", async () => {
      const controller = new AbortController()
      controller.abort()
      const client = createMoodleClient(createAbortedHttpPort())
      await assert.rejects(() =>
        client.listCourses(moodleDraft, controller.signal),
      )
    })
  })

  describe("fetchRoster", () => {
    it("throws on moodle exception during enrollment fetch", async () => {
      const client = createMoodleClient(
        createStatusHttpPort(
          200,
          JSON.stringify({
            exception: "moodle_exception",
            errorcode: "nopermission",
            message: "No permission",
          }),
        ),
      )
      await assert.rejects(() => client.fetchRoster(moodleDraft, "course-1"))
    })
  })
})

describe("error handling consistency across LMS providers", () => {
  it("both providers return verified: false on network error (not throw)", async () => {
    const httpErr = createNetworkErrorHttpPort()
    const canvas =
      await createCanvasClient(httpErr).verifyConnection(canvasDraft)
    const moodle =
      await createMoodleClient(httpErr).verifyConnection(moodleDraft)

    assert.equal(
      canvas.verified,
      false,
      "Canvas should return false on network error",
    )
    assert.equal(
      moodle.verified,
      false,
      "Moodle should return false on network error",
    )
  })

  it("both providers throw on non-verification operations when auth fails", async () => {
    const http401 = createStatusHttpPort(
      401,
      JSON.stringify({
        errors: [{ message: "Unauthorized" }],
        exception: "moodle_exception",
        errorcode: "invalidtoken",
        message: "Invalid token",
      }),
    )

    await assert.rejects(
      () => createCanvasClient(http401).listCourses(canvasDraft),
      "Canvas should throw on listCourses with 401",
    )
    await assert.rejects(
      () => createMoodleClient(http401).listCourses(moodleDraft),
      "Moodle should throw on listCourses with invalid token",
    )
  })

  it("both providers throw on listCourses when rate-limited", async () => {
    const http429 = createStatusHttpPort(429, JSON.stringify({}))

    await assert.rejects(
      () => createCanvasClient(http429).listCourses(canvasDraft),
      "Canvas should throw on listCourses with 429",
    )
    await assert.rejects(
      () => createMoodleClient(http429).listCourses(moodleDraft),
      "Moodle should throw on listCourses with 429",
    )
  })

  it("both providers return verified: false on aborted verifyConnection", async () => {
    const controller = new AbortController()
    controller.abort()
    const abortedHttp = createAbortedHttpPort()

    const canvas = await createCanvasClient(abortedHttp).verifyConnection(
      canvasDraft,
      controller.signal,
    )
    const moodle = await createMoodleClient(abortedHttp).verifyConnection(
      moodleDraft,
      controller.signal,
    )

    assert.equal(canvas.verified, false)
    assert.equal(moodle.verified, false)
  })
})
