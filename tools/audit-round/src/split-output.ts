import { join } from "node:path"
import { type AssistantRuntime, runAssistantPhase } from "./assistant.js"
import type { ExecutionContext } from "./context.js"
import { archiveSeries, movedSeriesText, restoreSeries } from "./evidence.js"
import { type ModelReleases, observedOutput } from "./feedback.js"
import { readPreviousRoundModels } from "./model-change.js"
import { type OutputOptions, RoundOutput } from "./output.js"
import type { RunEntry } from "./output-format.js"
import {
  type Assistant,
  efforts,
  implementationPhase,
  type PhaseInput,
  selectionTag,
} from "./phase.js"
import { splitLabel, splitLogFilename } from "./round-paths.js"
import type { RoundSettings } from "./settings.js"
import { runChecks, runSplit } from "./split.js"
import type { NamedAnswer, Writer } from "./split-answers.js"
import { attemptMoveList } from "./split-attempt.js"
import type { SessionAnswer } from "./split-design.js"
import { splitResultLine } from "./split-result.js"

type Call =
  | { mode: "design" | "both"; source: string }
  | { mode: "run"; named: NamedAnswer }

/** A call on a named answer has no assistant phases or release lookups. */
export async function splitStage(
  context: ExecutionContext,
  call: Call,
  runtime: AssistantRuntime,
  options: OutputOptions,
  settings: RoundSettings,
  releases: Record<Assistant, ModelReleases>,
  started: number,
  rerun: string,
): Promise<number> {
  const source = call.mode === "run" ? call.named.list.source : call.source
  const label = splitLabel(source)
  const restored = movedSeriesText(
    label,
    await restoreSeries(
      context.evidenceRoot,
      context.roundRoot,
      "split",
      label,
    ),
  )
  if (restored) options.terminal.write(restored)
  const session = { ...context, cwd: context.repoEduRoot }
  const designers = settings.split.designers.map((designer) =>
    implementationPhase(designer, "audit-round split designers"),
  )
  const picker = implementationPhase(
    settings.split.picker,
    "audit-round split picker",
  )
  const entries: RunEntry[] =
    call.mode === "run"
      ? []
      : [
          ...designers.map((entry, i) => ({
            ...entry,
            phase: "design" as const,
            tag: String(i + 1),
          })),
          { ...picker, phase: "pick" },
        ]
  const output = new RoundOutput(
    {
      name: "Split",
      title: `Split of ${source}`,
      target: label,
      started,
      settings,
      releases,
      phases: entries,
      paths: {
        claim: null,
        log: join(context.roundRoot, splitLogFilename(label)),
        markdown: null,
        mode: "a",
      },
      previousModels:
        call.mode === "run" ? [] : await readPreviousRoundModels(context),
    },
    options,
  )
  const invoke = async (
    input: PhaseInput<"design" | "pick">,
  ): Promise<SessionAnswer> => {
    let writer: Writer | undefined
    const recorder = observedOutput(output.phase, (feedback) => {
      if (feedback.type !== "model") return
      const { model, effort: reported } = feedback.selection
      const effort =
        efforts.find((value) => value === reported) ?? input.model.effort.value
      writer = {
        model,
        effort,
        tag: selectionTag(input.assistant, model, effort, settings),
      }
    })
    const result = await runAssistantPhase<"design" | "pick">(input, recorder, {
      ...runtime,
      cwd: session.cwd,
    })
    if (result.status === "failed") return result
    if (!writer)
      return {
        status: "failed",
        reason: `The ${input.phase} session reported no model.`,
        sessionId: result.sessionId,
      }
    return { ...result, writer }
  }
  try {
    const outcome = await runSplit(
      context,
      call.mode === "run"
        ? call
        : {
            ...call,
            sessions: {
              designers: designers.map((entry, index) => {
                const { density } = settings.split.designers[index]
                return {
                  density,
                  run: (hash) =>
                    invoke({
                      ...session,
                      ...entry,
                      phase: "design",
                      number: index + 1,
                      arguments: [source, hash, density],
                      sessionId: null,
                    }),
                }
              }),
              pick: (hash, answers) =>
                invoke({
                  ...session,
                  ...picker,
                  phase: "pick",
                  arguments: [source, hash, answers],
                  sessionId: null,
                }),
            },
          },
      {
        attempt: (list) =>
          attemptMoveList(context.repoEduRoot, list, runtime.signal),
        checks: (pkg) => runChecks(context.repoEduRoot, pkg, runtime.signal),
        message: output.message,
      },
    )
    if (outcome.status === "failed") {
      await output.message(
        `Split session failed: ${outcome.reason}\nSession: ${outcome.sessionId ?? "unavailable"}\nRerun: ${rerun}`,
      )
      return 1
    }
    const moved = movedSeriesText(
      label,
      await archiveSeries(
        context.evidenceRoot,
        context.roundRoot,
        "split",
        label,
      ),
    )
    if (moved) await output.message(moved)
    await output.message(splitResultLine(outcome.result))
    return 0
  } finally {
    output.close()
  }
}
