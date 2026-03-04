import {
  createCancelledAppError,
  isAppError,
  packageId as contractPackageId,
} from "@repo-edu/application-contract"
import type {
  AppError,
  DiagnosticOutput,
  UserFileExportPreviewResult,
  UserFileInspectResult,
  UserFileRef,
  UserSaveTargetRef,
  SpikeCorsWorkflowOutput,
  SpikeCorsWorkflowProgress,
  SpikeCorsWorkflowResult,
  SpikeWorkflowOutput,
  SpikeWorkflowProgress,
  SpikeWorkflowResult,
  WorkflowCallOptions,
} from "@repo-edu/application-contract"
import {
  formatSmokeWorkflowMessage,
  packageId as domainPackageId,
} from "@repo-edu/domain"
import type { HttpPort, UserFilePort } from "@repo-edu/host-runtime-contract"
import { packageId as hostRuntimePackageId } from "@repo-edu/host-runtime-contract"

export const packageId = "@repo-edu/application"
export const workspaceDependencies = [
  contractPackageId,
  domainPackageId,
  hostRuntimePackageId,
] as const

export type SmokeWorkflowResult = {
  workflowId: "phase-1.docs.smoke"
  message: string
  packageLine: string
  executedAt: string
}

export async function runSmokeWorkflow(
  source: string,
): Promise<SmokeWorkflowResult> {
  return {
    workflowId: "phase-1.docs.smoke",
    message: formatSmokeWorkflowMessage(source),
    packageLine: [packageId, contractPackageId, domainPackageId].join(" -> "),
    executedAt: new Date().toISOString(),
  }
}

function toCancelledAppError() {
  return createCancelledAppError()
}

function isSharedAppError(value: unknown): value is AppError {
  return isAppError(value)
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw toCancelledAppError()
  }
}

function normalizeUserFileError(
  error: unknown,
  operation: "read" | "write",
): AppError {
  if (isSharedAppError(error)) {
    return error
  }

  if (error instanceof Error && /not found/i.test(error.message)) {
    return {
      type: "not-found",
      message: error.message,
      resource: "file",
    }
  }

  return {
    type: "persistence",
    message: error instanceof Error ? error.message : String(error),
    operation,
  }
}

export async function runInspectUserFileWorkflow(
  userFilePort: UserFilePort,
  file: UserFileRef,
  options?: WorkflowCallOptions<SpikeWorkflowProgress, DiagnosticOutput>,
): Promise<UserFileInspectResult> {
  const totalSteps = 2

  try {
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
  } catch (error) {
    throw normalizeUserFileError(error, "read")
  }
}

export async function runUserFileExportPreviewWorkflow(
  userFilePort: UserFilePort,
  target: UserSaveTargetRef,
  options?: WorkflowCallOptions<SpikeWorkflowProgress, DiagnosticOutput>,
): Promise<UserFileExportPreviewResult> {
  const totalSteps = 2
  const preview = [
    "student_id,display_name,git_username",
    "s-1001,Ada Lovelace,adal",
    "s-1002,Grace Hopper,ghopper",
  ].join("\n")

  try {
    throwIfAborted(options?.signal)
    options?.onProgress?.({
      step: 1,
      totalSteps,
      label: "Preparing browser-safe export payload.",
    })
    options?.onOutput?.({
      channel: "info",
      message: `Writing export preview to ${target.displayName}.`,
    })

    const receipt = await userFilePort.writeText(target, preview, options?.signal)

    throwIfAborted(options?.signal)
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
  } catch (error) {
    throw normalizeUserFileError(error, "write")
  }
}

// ---------------------------------------------------------------------------
// Spike e2e-trpc workflow (phase 1.3 proof-of-concept)
// ---------------------------------------------------------------------------

const spikeSteps = [
  "Use-case started in packages/application.",
  "Domain function called from packages/domain.",
  "Simulated async work completed.",
] as const

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(toCancelledAppError())
      return
    }

    const timer = setTimeout(resolve, ms)
    const abort = () => {
      clearTimeout(timer)
      reject(toCancelledAppError())
    }

    signal?.addEventListener(
      "abort",
      abort,
      { once: true },
    )
  })
}

export async function runSpikeWorkflow(
  options?: WorkflowCallOptions<SpikeWorkflowProgress, SpikeWorkflowOutput>,
): Promise<SpikeWorkflowResult> {
  const totalSteps = spikeSteps.length

  for (let i = 0; i < spikeSteps.length; i++) {
    options?.onProgress?.({
      step: i + 1,
      totalSteps,
      label: spikeSteps[i],
    })

    if (i === 1) {
      const domainMessage = formatSmokeWorkflowMessage("spike-workflow")
      options?.onOutput?.({ line: domainMessage })
    }

    await delay(80, options?.signal)
  }

  return {
    workflowId: "spike.e2e-trpc",
    message: formatSmokeWorkflowMessage("spike-workflow"),
    packageLine: [packageId, contractPackageId, domainPackageId].join(" -> "),
    executedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Spike CORS-constrained workflow (phase 1.3 — Node-side HTTP proof)
// ---------------------------------------------------------------------------

const corsSteps = [
  "Preparing CORS-constrained HTTP request.",
  "Executing HTTP request through Node-side HttpPort.",
  "Processing response from external API.",
] as const

export type SpikeCorsWorkflowPorts = {
  http: HttpPort
}

export async function runSpikeCorsWorkflow(
  ports: SpikeCorsWorkflowPorts,
  options?: WorkflowCallOptions<
    SpikeCorsWorkflowProgress,
    SpikeCorsWorkflowOutput
  >,
): Promise<SpikeCorsWorkflowResult> {
  const totalSteps = corsSteps.length

  options?.onProgress?.({ step: 1, totalSteps, label: corsSteps[0] })
  options?.onOutput?.({
    line: "This request would fail from a browser renderer due to CORS.",
  })

  await delay(60, options?.signal)

  options?.onProgress?.({ step: 2, totalSteps, label: corsSteps[1] })

  const response = await ports.http.fetch({
    url: "https://api.github.com/zen",
    headers: { Accept: "text/plain" },
    signal: options?.signal,
  })

  options?.onOutput?.({
    line: `HTTP ${response.status} ${response.statusText}`,
  })

  await delay(60, options?.signal)

  options?.onProgress?.({ step: 3, totalSteps, label: corsSteps[2] })

  return {
    workflowId: "spike.cors-http",
    executedIn: "node",
    httpStatus: response.status,
    bodySnippet: response.body.slice(0, 200),
    executedAt: new Date().toISOString(),
  }
}
