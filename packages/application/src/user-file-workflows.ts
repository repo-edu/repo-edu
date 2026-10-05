import type {
  DiagnosticOutput,
  MilestoneProgress,
  UserFileExportPreviewResult,
  UserFileInspectResult,
  UserFileRef,
  UserSaveTargetRef,
  WorkflowCallOptions,
} from "@repo-edu/application-contract"
import type { UserFilePort } from "@repo-edu/host-runtime-contract"
import { commandThrowIfAborted } from "./command-outcomes.js"
import { throwIfAborted } from "./workflow-helpers.js"

/** The user-file port owns every answer of its read and write, so a port
 * failure passes through unchanged. */
export async function runInspectUserFileWorkflow(
  userFilePort: UserFilePort,
  file: UserFileRef,
  options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
): Promise<UserFileInspectResult> {
  const totalSteps = 2

  throwIfAborted(options?.signal)
  options?.onProgress?.({
    step: 1,
    totalSteps,
    label: "Resolving opaque user-file reference.",
  })

  const fileText = await userFilePort.readText(file, options?.signal)

  throwIfAborted(options?.signal)
  options?.onOutput?.({
    channel: "info",
    message: `Loaded ${fileText.displayName} (${fileText.byteLength} bytes).`,
  })
  options?.onProgress?.({
    step: 2,
    totalSteps,
    label: "Summarizing imported file content.",
  })

  const lines = fileText.text.split(/\r?\n/)

  return {
    workflowId: "userFile.inspectSelection",
    displayName: fileText.displayName,
    byteLength: fileText.byteLength,
    lineCount: lines.filter((line) => line.length > 0).length,
    firstLine: lines[0] ?? null,
  }
}

export async function runUserFileExportPreviewWorkflow(
  userFilePort: UserFilePort,
  target: UserSaveTargetRef,
  options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
): Promise<UserFileExportPreviewResult> {
  const totalSteps = 2
  const preview = [
    "student_id,display_name,git_username",
    "s-1001,Ada Lovelace,adal",
    "s-1002,Grace Hopper,ghopper",
  ].join("\n")

  commandThrowIfAborted(options?.signal)
  options?.onProgress?.({
    step: 1,
    totalSteps,
    label: "Preparing export payload.",
  })
  options?.onOutput?.({
    channel: "info",
    message: `Writing export preview to ${target.displayName}.`,
  })

  const receipt = await userFilePort.writeText(target, preview, options?.signal)

  options?.onProgress?.({
    step: 2,
    totalSteps,
    label: "Export preview written through UserFilePort.",
  })

  return {
    workflowId: "userFile.exportPreview",
    displayName: receipt.displayName,
    preview,
    savedAt: receipt.savedAt,
  }
}
