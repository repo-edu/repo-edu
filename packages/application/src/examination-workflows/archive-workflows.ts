import type {
  DiagnosticOutput,
  ExaminationArchiveExportResult,
  ExaminationArchiveImportSummary,
  MilestoneProgress,
  UserFileRef,
  UserSaveTargetRef,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { UserFilePort } from "@repo-edu/host-runtime-contract"
import { createValidationAppError } from "../core.js"
import { throwIfAborted } from "../workflow-helpers.js"
import type { ExaminationArchivePort } from "./archive-port.js"

type ArchiveWorkflowId =
  | "examination.archive.export"
  | "examination.archive.import"

export type ExaminationArchiveWorkflowPorts = {
  archive: ExaminationArchivePort
  userFile: UserFilePort
}

export function createExaminationArchiveWorkflowHandlers(
  ports: ExaminationArchiveWorkflowPorts,
): Pick<WorkflowHandlerMap<ArchiveWorkflowId>, ArchiveWorkflowId> {
  return {
    "examination.archive.export": async (
      input: UserSaveTargetRef,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ExaminationArchiveExportResult> => {
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 2,
        label: "Collecting archive records.",
      })
      const bundle = ports.archive.exportBundle()

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 2,
        totalSteps: 2,
        label: "Writing bundle.",
      })
      await ports.userFile.writeText(
        input,
        JSON.stringify(bundle, null, 2),
        options?.signal,
      )

      return {
        file: input,
        recordCount: bundle.records.length,
      }
    },
    "examination.archive.import": async (
      input: UserFileRef,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<ExaminationArchiveImportSummary> => {
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps: 2,
        label: "Reading bundle.",
      })
      const file = await ports.userFile.readText(input, options?.signal)

      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 2,
        totalSteps: 2,
        label: "Importing records.",
      })

      let parsed: unknown
      try {
        parsed = JSON.parse(file.text)
      } catch (error) {
        throw createValidationAppError(
          `Bundle is not valid JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
          [{ path: "bundle", message: "Invalid JSON." }],
        )
      }

      const summary = ports.archive.importBundle(parsed)
      for (const reason of summary.rejections) {
        options?.onOutput?.({
          channel: "warn",
          message: `Rejected archive record — ${reason}`,
        })
      }
      return summary
    },
  }
}
