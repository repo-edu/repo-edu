import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ChildProcessTreeUnconfirmedError } from "../child-process-lifetime-contract"
import { cleanBeforeTargetAdmission } from "../windows-child-process-lifetime-adapter"
import type { WindowsKillOnCloseJob } from "../windows-job"

function emptyJob(onClose: () => void): WindowsKillOnCloseJob {
  return {
    assign() {},
    close: onClose,
    contains: () => false,
    hasActiveProcesses: () => false,
    saveProcessIdentity() {
      throw new Error("No process identity is needed for this test.")
    },
    terminate() {},
  }
}

describe("Windows child-process cleanup", () => {
  it("retains an assigned job whose forced stop cannot be confirmed", async () => {
    let jobClosed = false
    const job: WindowsKillOnCloseJob = {
      ...emptyJob(() => {
        jobClosed = true
      }),
      hasActiveProcesses: () => true,
    }

    await assert.rejects(
      cleanBeforeTargetAdmission({
        assigned: true,
        child: null,
        controlInput: null,
        controlLines: null,
        exit: null,
        forcedStopConfirmationPeriodMs: 0,
        job,
      }),
      ChildProcessTreeUnconfirmedError,
    )
    assert.equal(jobClosed, false)
  })

  it("uses the forced-stop period for an unassigned launcher", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] })
    let jobClosed = false
    const cleanup = cleanBeforeTargetAdmission({
      assigned: false,
      child: null,
      controlInput: null,
      controlLines: null,
      exit: new Promise<never>(() => {}),
      forcedStopConfirmationPeriodMs: 40,
      job: emptyJob(() => {
        jobClosed = true
      }),
    })
    let cleanupError: unknown
    void cleanup.catch((error: unknown) => {
      cleanupError = error
    })

    context.mock.timers.tick(39)
    await Promise.resolve()
    assert.equal(cleanupError, undefined)
    assert.equal(jobClosed, false)

    context.mock.timers.tick(1)
    await assert.rejects(cleanup, /Windows unassigned launcher exit timed out/)
    assert.equal(jobClosed, true)
  })
})
