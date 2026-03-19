import type {
  DiagnosticOutput,
  GroupSetExportInput,
  GroupSetPreviewImportFromFileInput,
  GroupSetPreviewReimportFromFileInput,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  exportGroupSetRows,
  exportRepoTeams,
  previewImportGroupSet,
  previewReimportGroupSet,
} from "@repo-edu/domain/group-set-import-export"
import type { UserFileText } from "@repo-edu/host-runtime-contract"
import { parseCsv, serializeCsv } from "../adapters/tabular/index.js"
import { createValidationAppError } from "../core.js"
import {
  inferFileFormat,
  normalizeUserFileError,
  parseGroupSetImportRows,
  resolveCourseSnapshot,
  throwIfAborted,
} from "../workflow-helpers.js"
import { groupSetExportHeaders, serializeRepobeeYaml } from "./helpers.js"
import type { GroupSetWorkflowPorts } from "./ports.js"

export function createFileGroupSetHandlers(
  ports: GroupSetWorkflowPorts,
): Pick<
  WorkflowHandlerMap<
    | "groupSet.previewImportFromFile"
    | "groupSet.previewReimportFromFile"
    | "groupSet.export"
  >,
  | "groupSet.previewImportFromFile"
  | "groupSet.previewReimportFromFile"
  | "groupSet.export"
> {
  return {
    "groupSet.previewImportFromFile": async (
      input: GroupSetPreviewImportFromFileInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading course snapshot for group-set import preview.",
      })
      const course = resolveCourseSnapshot(input.course)
      throwIfAborted(options?.signal)

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Reading and parsing group-set import file.",
      })
      let fileText: UserFileText
      try {
        fileText = await ports.userFile.readText(input.file, options?.signal)
      } catch (error) {
        throw normalizeUserFileError(error, "read")
      }
      const format = inferFileFormat(input.file)
      if (format !== "csv") {
        throw createValidationAppError(
          "Group-set preview format is unsupported.",
          [
            {
              path: "file.format",
              message:
                "Only CSV group-set preview is supported by the current text-based file port.",
            },
          ],
        )
      }
      const parsedRows = parseGroupSetImportRows(parseCsv(fileText.text).rows)
      const preview = previewImportGroupSet(course.roster, parsedRows)
      if (!preview.ok) {
        throw createValidationAppError(
          "Group-set import preview failed.",
          preview.issues,
        )
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Group-set import preview complete.",
      })
      return preview.value
    },
    "groupSet.previewReimportFromFile": async (
      input: GroupSetPreviewReimportFromFileInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading course snapshot for group-set reimport preview.",
      })
      const course = resolveCourseSnapshot(input.course)
      throwIfAborted(options?.signal)

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Reading and parsing group-set reimport file.",
      })
      let fileText: UserFileText
      try {
        fileText = await ports.userFile.readText(input.file, options?.signal)
      } catch (error) {
        throw normalizeUserFileError(error, "read")
      }
      const format = inferFileFormat(input.file)
      if (format !== "csv") {
        throw createValidationAppError(
          "Group-set reimport preview format is unsupported.",
          [
            {
              path: "file.format",
              message:
                "Only CSV group-set reimport preview is supported by the current text-based file port.",
            },
          ],
        )
      }
      const parsedRows = parseGroupSetImportRows(parseCsv(fileText.text).rows)
      const preview = previewReimportGroupSet(
        course.roster,
        input.groupSetId,
        parsedRows,
      )
      if (!preview.ok) {
        throw createValidationAppError(
          "Group-set reimport preview failed.",
          preview.issues,
        )
      }

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Group-set reimport preview complete.",
      })
      return preview.value
    },
    "groupSet.export": async (
      input: GroupSetExportInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading course snapshot and group set for export.",
      })
      const course = resolveCourseSnapshot(input.course)
      throwIfAborted(options?.signal)

      const exportedRows = exportGroupSetRows(course.roster, input.groupSetId)
      if (!exportedRows.ok) {
        throw createValidationAppError(
          "Group-set export preparation failed.",
          exportedRows.issues,
        )
      }

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Serializing group-set export payload.",
      })
      let serialized = ""
      switch (input.format) {
        case "csv":
          serialized = serializeCsv({
            headers: [...groupSetExportHeaders],
            rows: exportedRows.value,
          })
          break
        case "yaml": {
          const teams = exportRepoTeams(course.roster, input.groupSetId)
          if (!teams.ok) {
            throw createValidationAppError(
              "Repobee YAML export preparation failed.",
              teams.issues,
            )
          }
          serialized = serializeRepobeeYaml(teams.value)
          break
        }
        case "xlsx":
          throw createValidationAppError(
            "Group-set export format is unsupported.",
            [
              {
                path: "format",
                message:
                  "XLSX group-set export is unsupported with the current text-based file port.",
              },
            ],
          )
      }

      await ports.userFile.writeText(input.target, serialized, options?.signal)
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Group-set export written.",
      })

      return { file: input.target }
    },
  }
}
