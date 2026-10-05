import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  CommandOutcomeError,
  type UserFileRef,
  type UserSaveTargetRef,
} from "@repo-edu/application-contract"
import { splitAppSettings } from "@repo-edu/domain/settings"
import type { UserFilePort } from "@repo-edu/host-runtime-contract"
import { createExaminationArchiveWorkflowHandlers } from "../examination-workflows/archive-workflows.js"
import { createGitUsernameWorkflowHandlers } from "../git-username-workflows.js"
import { createGroupSetWorkflowHandlers } from "../group-set-workflows.js"
import { createRosterWorkflowHandlers } from "../roster-workflows.js"
import { runUserFileExportPreviewWorkflow } from "../user-file-workflows.js"
import { getCourseAndSettingsScenario } from "./helpers/fixture-scenarios.js"
import { createInMemoryExaminationArchive } from "./helpers/in-memory-examination-archive.js"

// Every exclusive command that reads or writes a teacher's file. The
// user-file port owns each answer of that call, so a command passes it
// through unchanged and never turns a failure without an outcome into one.

const { course, settings } = getCourseAndSettingsScenario({
  tier: "small",
  preset: "shared-teams",
})
const credentials = splitAppSettings(settings).credentials
const exportedGroupSet = course.roster.groupSets.find(
  (groupSet) => groupSet.connection === null,
)
assert.ok(exportedGroupSet)

const file: UserFileRef = {
  kind: "user-file-ref",
  referenceId: "file-1",
  displayName: "import.csv",
  mediaType: "text/csv",
  byteLength: null,
}
const target: UserSaveTargetRef = {
  kind: "user-save-target-ref",
  referenceId: "target-1",
  displayName: "export.csv",
  suggestedFormat: "csv",
}

async function notReached(): Promise<never> {
  assert.fail("The command must not get past the failed file call.")
}

type FileCommand = (
  userFile: UserFilePort,
  signal?: AbortSignal,
) => Promise<unknown>

const reads: Record<string, FileCommand> = {
  "gitUsernames.import": (userFile, signal) =>
    createGitUsernameWorkflowHandlers({
      userFile,
      git: { verifyGitUsernames: notReached },
    })["gitUsernames.import"]({ course, credentials, file }, { signal }),
  "roster.importFromFile": (userFile, signal) =>
    createRosterWorkflowHandlers({
      lms: { fetchRoster: notReached },
      userFile,
    })["roster.importFromFile"]({ course, file }, { signal }),
  "groupSet.importFromFile": (userFile, signal) =>
    createGroupSetWorkflowHandlers({
      lms: { listGroupSets: notReached, fetchGroupSet: notReached },
      userFile,
    })["groupSet.importFromFile"](
      { course, file, format: "group-set-csv", targetGroupSetId: null },
      { signal },
    ),
  "examination.archive.import": (userFile, signal) =>
    createExaminationArchiveWorkflowHandlers({
      archive: createInMemoryExaminationArchive(),
      userFile,
    })["examination.archive.import"](file, { signal }),
}

const writes: Record<string, FileCommand> = {
  "roster.exportMembers": (userFile, signal) =>
    createRosterWorkflowHandlers({
      lms: { fetchRoster: notReached },
      userFile,
    })["roster.exportMembers"]({ course, target, format: "csv" }, { signal }),
  "groupSet.export": (userFile, signal) =>
    createGroupSetWorkflowHandlers({
      lms: { listGroupSets: notReached, fetchGroupSet: notReached },
      userFile,
    })["groupSet.export"](
      { course, groupSetId: exportedGroupSet.id, target, format: "csv" },
      { signal },
    ),
  "userFile.exportPreview": (userFile, signal) =>
    runUserFileExportPreviewWorkflow(userFile, target, { signal }),
  "examination.archive.export": (userFile, signal) =>
    createExaminationArchiveWorkflowHandlers({
      archive: createInMemoryExaminationArchive(),
      userFile,
    })["examination.archive.export"](target, { signal }),
}

/** A port whose every call ends with `failure`, recording each call. */
function failingUserFile(failure: unknown, calls: string[] = []): UserFilePort {
  return {
    async readText() {
      calls.push("read")
      throw failure
    },
    async writeText() {
      calls.push("write")
      throw failure
    },
  }
}

const portRefusal = () =>
  new CommandOutcomeError({
    disposition: "refused",
    error: { type: "effect", message: "Unknown user-file reference: file-1" },
  })
const portStop = () =>
  new CommandOutcomeError({ disposition: "stopped", result: null })
const portFailedWrite = () =>
  new CommandOutcomeError({
    disposition: "completed",
    completion: {
      status: "failed",
      error: {
        type: "effect",
        message: "Could not write export.csv; the file may be incomplete.",
      },
      result: null,
    },
  })
const unprovenFailure = () => new Error("The port gave no outcome.")

function describeFileCall(
  call: "read" | "write",
  commands: Record<string, FileCommand>,
  answers: Record<string, () => unknown>,
) {
  for (const [command, run] of Object.entries(commands)) {
    describe(`${command} ${call}`, () => {
      for (const [answer, failure] of Object.entries(answers)) {
        it(`passes ${answer} through unchanged`, async () => {
          const thrown = failure()
          await assert.rejects(run(failingUserFile(thrown)), (error) => {
            assert.equal(error, thrown)
            return true
          })
        })
      }

      it("stops before the call when Cancel came first", async () => {
        const calls: string[] = []
        const controller = new AbortController()
        controller.abort()
        await assert.rejects(
          run(failingUserFile(unprovenFailure(), calls), controller.signal),
          (error: unknown) => {
            assert.ok(error instanceof CommandOutcomeError)
            assert.deepEqual(error.outcome, {
              disposition: "stopped",
              result: null,
            })
            return true
          },
        )
        assert.deepEqual(calls, [])
      })
    })
  }
}

describeFileCall("read", reads, {
  "the port's refusal": portRefusal,
  "the port's stop": portStop,
  // Without the port's outcome the desktop ends the session.
  "a failure without an outcome": unprovenFailure,
})

describeFileCall("write", writes, {
  "the port's refusal": portRefusal,
  "the port's stop": portStop,
  "the port's failed completion": portFailedWrite,
  // Without the port's outcome the desktop ends the session.
  "a failure without an outcome": unprovenFailure,
})
