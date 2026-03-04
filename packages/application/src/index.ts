import type {
  SpikeCorsWorkflowOutput,
  SpikeCorsWorkflowProgress,
  SpikeCorsWorkflowResult,
  SpikeWorkflowOutput,
  SpikeWorkflowProgress,
  SpikeWorkflowResult,
  WorkflowCallOptions,
} from "@repo-edu/application-contract"
import { packageId as contractPackageId } from "@repo-edu/application-contract"
import {
  formatSmokeWorkflowMessage,
  packageId as domainPackageId,
} from "@repo-edu/domain"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
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
      reject(signal.reason)
      return
    }

    const timer = setTimeout(resolve, ms)

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
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
