import type {
  DiagnosticOutput,
  GitUsernameImportInput,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { UserFilePort } from "@repo-edu/host-runtime-contract"
import type {
  GitProviderClient,
  GitUsernameStatus,
} from "@repo-edu/integrations-git-contract"
import { parseCsv } from "./adapters/tabular/index.js"
import { commandRefusal, readOnlyCommand } from "./command-outcomes.js"
import { createValidationAppError } from "./core.js"
import {
  inferFileFormat,
  normalizeProviderError,
  parseGitUsernameRows,
  resolveAppCredentialsSnapshot,
  resolveCourseSnapshot,
  resolveGitDraft,
  throwIfAborted,
} from "./workflow-helpers.js"

export type GitUsernameWorkflowPorts = {
  userFile: UserFilePort
  git: Pick<GitProviderClient, "verifyGitUsernames">
}

function normalizeImportedEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** The command only reads. The user-file port's answers pass through
 * unchanged. A Git provider failure refuses the import, and a proven stop
 * stops it. */
export function createGitUsernameWorkflowHandlers(
  ports: GitUsernameWorkflowPorts,
): Pick<WorkflowHandlerMap<"gitUsernames.import">, "gitUsernames.import"> {
  return {
    "gitUsernames.import": readOnlyCommand(
      async (
        input: GitUsernameImportInput,
        options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
      ) => {
        const totalSteps = 5

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const settings = resolveAppCredentialsSnapshot(input.credentials)
        const course = resolveCourseSnapshot(input.course)
        throwIfAborted(options?.signal)

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Reading Git username import file.",
        })
        const fileText = await ports.userFile.readText(
          input.file,
          options?.signal,
        )
        const format = inferFileFormat(input.file)
        if (format !== "csv") {
          throw createValidationAppError(
            "Git username import file format is unsupported.",
            [
              {
                path: "file.format",
                message:
                  "Only CSV Git username import is supported by the current text-based file port.",
              },
            ],
          )
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Parsing and applying Git username rows.",
        })
        const parsed = parseCsv(fileText.text)
        const rows = parseGitUsernameRows(parsed.rows)
        const roster = {
          ...course.roster,
          students: course.roster.students.map((student) => ({ ...student })),
          staff: course.roster.staff.map((member) => ({ ...member })),
        }
        const studentIndexByEmail = new Map<string, number>()
        for (const [index, student] of roster.students.entries()) {
          studentIndexByEmail.set(normalizeImportedEmail(student.email), index)
        }

        let matched = 0
        let unmatched = 0
        for (const row of rows) {
          const memberIndex = studentIndexByEmail.get(
            normalizeImportedEmail(row.email),
          )
          if (memberIndex === undefined) {
            unmatched += 1
            continue
          }

          const member = roster.students[memberIndex]
          if (member.gitUsername !== row.git_username) {
            member.gitUsername = row.git_username
            member.gitUsernameStatus = "unknown"
          }
          matched += 1
        }

        const gitDraft = resolveGitDraft(settings)
        if (gitDraft !== null) {
          options?.onProgress?.({
            step: 4,
            totalSteps,
            label: "Verifying imported Git usernames with provider.",
          })

          const usernames = Array.from(
            new Set(
              roster.students
                .map((member) => member.gitUsername?.trim() ?? "")
                .filter((username) => username.length > 0),
            ),
          )
          let verificationResults: GitUsernameStatus[]
          try {
            verificationResults = await ports.git.verifyGitUsernames(
              gitDraft,
              usernames,
              options?.signal,
            )
          } catch (error) {
            throw normalizeProviderError(
              error,
              gitDraft.provider,
              "verifyGitUsernames",
            )
          }
          const verificationByUsername = new Map(
            verificationResults.map((result) => [result.username, result]),
          )

          for (const member of roster.students) {
            const username = member.gitUsername?.trim() ?? ""
            if (username.length === 0) {
              continue
            }
            const status = verificationByUsername.get(username)
            // A username the reply leaves out failed its lookup, so it must
            // not read as one that was never checked.
            if (status === undefined) {
              throw commandRefusal({
                type: "effect",
                message: `The Git server gave no answer for username '${username}'.`,
              })
            }
            member.gitUsernameStatus = status.exists ? "valid" : "invalid"
          }
        } else {
          options?.onProgress?.({
            step: 4,
            totalSteps,
            label:
              "Skipping provider verification (no Git connection configured).",
          })
        }

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "Git username import complete.",
        })
        options?.onOutput?.({
          channel: "info",
          message: `Imported ${matched} Git usernames (${unmatched} unmatched emails).`,
        })
        return roster
      },
    ),
  }
}
