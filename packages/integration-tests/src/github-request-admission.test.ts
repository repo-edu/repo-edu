import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createGitHubIntegrationRequestAdmission,
  GitHubIntegrationRateLimitError,
} from "./github-request-admission.js"

describe("GitHub live request admission", () => {
  it("spaces mutations by one second", async () => {
    let currentTime = 10_000
    const waits: number[] = []
    const admission = createGitHubIntegrationRequestAdmission({
      now: () => currentTime,
      async wait(milliseconds) {
        waits.push(milliseconds)
        currentTime += milliseconds
      },
    })

    await admission.send("POST", async () => ({ status: 201 }))
    currentTime += 250
    await admission.send("DELETE", async () => ({ status: 204 }))

    assert.deepEqual(waits, [750])
  })

  it("stops every later request after a mutation rate-limit reply", async () => {
    const admission = createGitHubIntegrationRequestAdmission()
    let calls = 0

    await assert.rejects(
      admission.send("POST", async () => {
        calls += 1
        return { status: 403 }
      }),
      GitHubIntegrationRateLimitError,
    )
    await assert.rejects(
      admission.send("GET", async () => {
        calls += 1
        return { status: 200 }
      }),
      GitHubIntegrationRateLimitError,
    )

    assert.equal(calls, 1)
  })
})
