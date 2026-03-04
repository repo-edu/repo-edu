import type {
  AppError,
  SpikeCorsWorkflowOutput,
  SpikeCorsWorkflowProgress,
  SpikeCorsWorkflowResult,
} from "@repo-edu/application-contract"
import { packageId as appPackageId } from "@repo-edu/app"
import { createDesktopWorkflowClient } from "./workflow-client"

const mountNode = document.querySelector<HTMLDivElement>("#app")

if (!mountNode) {
  throw new Error("Renderer mount node #app was not found")
}

const appRoot = mountNode

const trpcMarker = "repo-edu-desktop-trpc"
const searchParams = new URLSearchParams(window.location.search)
const isTRPCValidationMode = searchParams.get("mode") === "validate-trpc"

const workflowClient = createDesktopWorkflowClient()

type SpikeState = {
  progress: SpikeCorsWorkflowProgress[]
  output: SpikeCorsWorkflowOutput[]
  result: SpikeCorsWorkflowResult | null
  error: string | null
  status: string
}

function render(state: SpikeState) {
  const progressMarkup = state.progress
    .map(
      (p) => `
        <li style="margin-top: 12px;">
          <strong>Step ${p.step}/${p.totalSteps}</strong>: ${p.label}
        </li>
      `,
    )
    .join("")

  const outputMarkup = state.output
    .map(
      (o) => `
        <li style="margin-top: 6px; color: #94a3b8; font-family: monospace; font-size: 13px;">
          ${o.line}
        </li>
      `,
    )
    .join("")

  const resultMarkup = state.result
    ? `
      <div style="margin-top: 20px; padding: 16px; border-radius: 12px; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3);">
        <p style="margin: 0 0 8px; font-size: 13px; color: #86efac;">Workflow completed (executed in: ${state.result.executedIn})</p>
        <p style="margin: 0; font-size: 14px; color: #e5e7eb;">HTTP ${state.result.httpStatus}: ${state.result.bodySnippet}</p>
      </div>
    `
    : ""

  appRoot.innerHTML = `
    <section
      style="
        min-height: 100vh;
        display: grid;
        place-items: center;
        margin: 0;
        background:
          radial-gradient(circle at top, rgba(14, 165, 233, 0.22), transparent 40%),
          linear-gradient(135deg, #0f172a, #111827 45%, #1f2937);
        color: #e5e7eb;
        font-family: Georgia, 'Times New Roman', serif;
        padding: 32px;
      "
    >
      <article
        style="
          width: min(760px, 100%);
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 20px;
          padding: 28px;
          background: rgba(15, 23, 42, 0.7);
          box-shadow: 0 24px 80px rgba(15, 23, 42, 0.35);
        "
      >
        <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #93c5fd;">
          Phase 1.3 CORS-Constrained Provider Spike
        </p>
        <h1 style="margin: 0; font-size: clamp(32px, 7vw, 56px); line-height: 1.05;">
          Node-side HTTP via HttpPort.
        </h1>
        <p style="margin: 16px 0 0; font-size: 16px; line-height: 1.6; color: #cbd5e1;">
          The renderer subscribes to a <strong>typed tRPC workflow</strong> that calls
          a CORS-constrained API through a <strong>Node-side HttpPort</strong>
          while importing the shared app package: <strong>${appPackageId}</strong>.
        </p>
        <p style="margin: 20px 0 0; font-size: 14px; color: #bae6fd;">
          Status: ${state.status}
        </p>
        <ol style="margin: 20px 0 0; padding-left: 20px; color: #dbeafe; line-height: 1.7;">
          ${progressMarkup || "<li>Waiting for workflow progress events...</li>"}
        </ol>
        ${outputMarkup ? `<ul style="margin: 12px 0 0; padding-left: 20px; list-style: none;">${outputMarkup}</ul>` : ""}
        ${resultMarkup}
        <output id="repo-edu-trpc-marker" hidden></output>
      </article>
    </section>
  `
}

function emitValidationMarker(payload: Record<string, unknown>) {
  const markerNode = document.querySelector<HTMLOutputElement>(
    "#repo-edu-trpc-marker",
  )

  if (!markerNode) {
    return
  }

  markerNode.value = JSON.stringify(payload)
  markerNode.textContent = markerNode.value
}

async function runCorsWorkflowSubscription() {
  const state: SpikeState = {
    progress: [],
    output: [],
    result: null,
    error: null,
    status: "Starting CORS workflow subscription...",
  }

  render(state)

  try {
    const result = await workflowClient.run("spike.cors-http", undefined, {
      onProgress(event) {
        state.progress.push(event)
        state.status = `Progress ${event.step}/${event.totalSteps}`
        render(state)
      },
      onOutput(event) {
        state.output.push(event)
        render(state)
      },
    })

    state.result = result
    state.status = "Workflow completed."
    render(state)

    if (isTRPCValidationMode) {
      emitValidationMarker({
        marker: trpcMarker,
        workflowId: result.workflowId,
        executedIn: result.executedIn,
        httpStatus: result.httpStatus,
        progressCount: state.progress.length,
        outputCount: state.output.length,
      })
    }
  } catch (error) {
    const appError = normalizeAppError(error)

    state.error = appError.message
    state.status = `${appError.type === "transport" ? "Transport" : "Workflow"} error: ${appError.message}`
    render(state)

    if (isTRPCValidationMode) {
      emitValidationMarker({
        marker: trpcMarker,
        error: appError.message,
        errorType: appError.type,
      })
    }

    throw new Error(appError.message)
  }
}

function normalizeAppError(error: unknown): AppError {
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    "message" in error &&
    typeof error.type === "string" &&
    typeof error.message === "string"
  ) {
    return error as AppError
  }

  return {
    type: "unexpected",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  }
}

void runCorsWorkflowSubscription().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)

  render({
    progress: [],
    output: [],
    result: null,
    error: message,
    status: `Subscription failed: ${message}`,
  })

  if (isTRPCValidationMode) {
    emitValidationMarker({
      marker: trpcMarker,
      error: message,
    })
  }
})
