import type {
  SpikeCorsWorkflowEvent,
  SpikeCorsWorkflowOutput,
  SpikeCorsWorkflowProgress,
  SpikeCorsWorkflowResult,
} from "@repo-edu/application-contract"
import { packageId as appPackageId } from "@repo-edu/app"
import { createTRPCProxyClient } from "@trpc/client"
import { ipcLink } from "trpc-electron/renderer"
import type { DesktopRouter } from "./trpc"

const mountNode = document.querySelector<HTMLDivElement>("#app")

if (!mountNode) {
  throw new Error("Renderer mount node #app was not found")
}

const appRoot = mountNode

const trpcMarker = "repo-edu-desktop-trpc"
const searchParams = new URLSearchParams(window.location.search)
const isTRPCValidationMode = searchParams.get("mode") === "validate-trpc"

const client = createTRPCProxyClient<DesktopRouter>({
  links: [ipcLink<DesktopRouter>()],
})

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

  await new Promise<void>((resolve, reject) => {
    let settled = false

    const subscription = client.spikeCorsWorkflow.subscribe(undefined, {
      onData(event: SpikeCorsWorkflowEvent) {
        switch (event.type) {
          case "progress":
            state.progress.push(event.data)
            state.status = `Progress ${event.data.step}/${event.data.totalSteps}`
            render(state)
            break
          case "output":
            state.output.push(event.data)
            render(state)
            break
          case "completed":
            state.result = event.data
            state.status = "Workflow completed."
            render(state)

            if (isTRPCValidationMode) {
              emitValidationMarker({
                marker: trpcMarker,
                workflowId: event.data.workflowId,
                executedIn: event.data.executedIn,
                httpStatus: event.data.httpStatus,
                progressCount: state.progress.length,
                outputCount: state.output.length,
              })
            }

            settled = true
            resolve()
            break
          case "failed":
            state.error = event.error.message
            state.status = `Workflow failed: ${event.error.message}`
            render(state)

            if (isTRPCValidationMode) {
              emitValidationMarker({
                marker: trpcMarker,
                error: event.error.message,
                errorType: event.error.type,
              })
            }

            settled = true
            reject(new Error(event.error.message))
            break
        }
      },
      onError(error) {
        state.status = `Transport error: ${error.message}`
        render(state)
        reject(error)
      },
      onComplete() {
        if (!settled) {
          state.status = "Subscription completed without terminal event."
          render(state)
          resolve()
        }
      },
    })

    if (isTRPCValidationMode) {
      window.addEventListener(
        "beforeunload",
        () => {
          if (!settled) {
            subscription.unsubscribe()
          }
        },
        { once: true },
      )
    }
  })
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
