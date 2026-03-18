import type {
  DiagnosticOutput,
  MilestoneProgress,
  RosterExportMembersInput,
  RosterImportFromFileInput,
  RosterImportFromLmsInput,
  VerifyLmsDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  ensureSystemGroupSets,
  mergeRosterFromLmsWithConflicts,
} from "@repo-edu/domain"
import type { UserFilePort } from "@repo-edu/host-runtime-contract"
import type { LmsClient } from "@repo-edu/integrations-lms-contract"
import { parseCsv, serializeCsv } from "./adapters/tabular/index.js"
import { createValidationAppError } from "./core.js"
import {
  inferFileFormat,
  isSharedAppError,
  normalizeProviderError,
  parseStudentRows,
  resolveAppSettingsSnapshot,
  resolveCourseSnapshot,
  resolveLmsDraft,
  rosterFromStudentRows,
  throwIfAborted,
} from "./workflow-helpers.js"

export type RosterWorkflowPorts = {
  lms: Pick<LmsClient, "fetchRoster">
  userFile: UserFilePort
}

const memberExportHeaders = [
  "id",
  "name",
  "email",
  "student_number",
  "git_username",
  "status",
  "enrollment_type",
] as const

export function createRosterWorkflowHandlers(
  ports: RosterWorkflowPorts,
): Pick<
  WorkflowHandlerMap<
    "roster.importFromFile" | "roster.importFromLms" | "roster.exportMembers"
  >,
  "roster.importFromFile" | "roster.importFromLms" | "roster.exportMembers"
> {
  return {
    "roster.importFromFile": async (
      input: RosterImportFromFileInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading roster import file.",
      })
      const fileText = await ports.userFile.readText(
        input.file,
        options?.signal,
      )

      const format = inferFileFormat(input.file)
      if (format !== "csv") {
        throw createValidationAppError(
          "Roster import file format is unsupported.",
          [
            {
              path: "file.format",
              message:
                "Only CSV roster import is supported by the current text-based file port.",
            },
          ],
        )
      }

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Parsing student rows from CSV.",
      })
      const parsed = parseCsv(fileText.text)
      const rows = parseStudentRows(parsed.rows)
      const roster = rosterFromStudentRows(rows)
      roster.connection = {
        kind: "import",
        sourceFilename: fileText.displayName,
        lastUpdated: new Date().toISOString(),
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Roster import complete.",
      })
      options?.onOutput?.({
        channel: "info",
        message: `Imported ${roster.students.length} students from ${fileText.displayName}.`,
      })
      return roster
    },
    "roster.importFromLms": async (
      input: RosterImportFromLmsInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 4
      let providerForError: VerifyLmsDraftInput["provider"] = "canvas"
      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)

        const draft = resolveLmsDraft(course, settings)
        providerForError = draft.provider

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Fetching roster from LMS provider.",
        })
        options?.onOutput?.({
          channel: "info",
          message: `Fetching roster from ${draft.provider} course ${input.lmsCourseId}.`,
        })
        const fetchedRoster = await ports.lms.fetchRoster(
          draft,
          input.lmsCourseId,
          options?.signal,
          (message) => {
            options?.onProgress?.({
              step: 2,
              totalSteps,
              label: message,
            })
          },
        )

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Merging roster members.",
        })
        const result = mergeRosterFromLmsWithConflicts(
          course.roster,
          fetchedRoster,
        )
        ensureSystemGroupSets(result.roster)

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "LMS roster import complete.",
        })
        return result
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(error, providerForError, "fetchRoster")
      }
    },
    "roster.exportMembers": async (
      input: RosterExportMembersInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading course snapshot for roster export.",
      })
      const course = resolveCourseSnapshot(input.course)
      throwIfAborted(options?.signal)

      if (input.format !== "csv") {
        throw createValidationAppError("Roster export format is unsupported.", [
          {
            path: "format",
            message:
              "Only CSV export is supported by the current text-based file port.",
          },
        ])
      }

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Serializing roster export payload.",
      })
      const allMembers = [...course.roster.students, ...course.roster.staff]
      const exportRows = allMembers.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        student_number: member.studentNumber ?? "",
        git_username: member.gitUsername ?? "",
        status: member.status,
        enrollment_type: member.enrollmentType,
      }))
      const text = serializeCsv({
        headers: [...memberExportHeaders],
        rows: exportRows,
      })
      await ports.userFile.writeText(input.target, text, options?.signal)

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Roster export written.",
      })
      options?.onOutput?.({
        channel: "info",
        message: `Exported ${exportRows.length} members to ${input.target.displayName}.`,
      })

      return { file: input.target }
    },
  }
}
