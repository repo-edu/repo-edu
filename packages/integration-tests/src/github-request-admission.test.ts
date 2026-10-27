import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createGitHubIntegrationRequestAdmission,
  GitHubIntegrationRateLimitError,
  GitHubIntegrationRunWindowError,
  type GitHubRunRecord,
} from "./github-request-admission.js"

function createMemoryRunRecord(startedAt: number | null = null) {
  const writes: number[] = []
  const record: GitHubRunRecord = {
    readStartedAt: () => startedAt,
    writeStartedAt(value) {
      startedAt = value
      writes.push(value)
    },
  }
  return { record, writes }
}

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
      runRecord: createMemoryRunRecord().record,
    })

    await admission.send("GET", async () => ({ status: 200 }))
    await admission.send("POST", async () => ({ status: 201 }))
    currentTime += 250
    await admission.send("DELETE", async () => ({ status: 204 }))

    assert.deepEqual(waits, [750])
    assert.equal(admission.mutationsSent(), 2)
  })

  it("stops every later request after a mutation rate-limit reply", async () => {
    const admission = createGitHubIntegrationRequestAdmission({
      runRecord: createMemoryRunRecord().record,
    })
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

  for (const status of [403, 429]) {
    it(`stops the next mutation after a read returns ${status}`, async () => {
      const { record, writes } = createMemoryRunRecord()
      const admission = createGitHubIntegrationRequestAdmission({
        runRecord: record,
      })
      let calls = 0

      await assert.rejects(
        admission.send("GET", async () => {
          calls += 1
          return { status }
        }),
        GitHubIntegrationRateLimitError,
      )
      await assert.rejects(
        admission.send("POST", async () => {
          calls += 1
          return { status: 201 }
        }),
        GitHubIntegrationRateLimitError,
      )

      assert.equal(calls, 1)
      assert.deepEqual(writes, [])
    })
  }

  it("records the run start at its first mutation only", async () => {
    const { record, writes } = createMemoryRunRecord(1_000_000)
    const admission = createGitHubIntegrationRequestAdmission({
      now: () => 5_000_000,
      wait: async () => {},
      runRecord: record,
    })

    await admission.send("GET", async () => ({ status: 200 }))
    assert.deepEqual(writes, [])

    await admission.send("POST", async () => ({ status: 201 }))
    await admission.send("POST", async () => ({ status: 201 }))

    assert.deepEqual(writes, [5_000_000])
  })

  it("refuses the run while the previous run's hour is active", async () => {
    const { record, writes } = createMemoryRunRecord(1_000_000)
    const admission = createGitHubIntegrationRequestAdmission({
      now: () => 1_000_000 + 3_599_999,
      runRecord: record,
    })
    let calls = 0

    await assert.rejects(
      admission.send("POST", async () => {
        calls += 1
        return { status: 201 }
      }),
      GitHubIntegrationRunWindowError,
    )
    await assert.rejects(
      admission.send("GET", async () => {
        calls += 1
        return { status: 200 }
      }),
      GitHubIntegrationRunWindowError,
    )

    assert.equal(calls, 0)
    assert.deepEqual(writes, [])
  })
})
