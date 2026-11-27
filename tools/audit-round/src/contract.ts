import { createReadStream } from "node:fs"
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { z } from "zod"
import { type AssistantRuntime, runAssistantInvocation } from "./assistant.js"
import { readCliLines, withCliProcess } from "./cli-process.js"
import {
  codexSessionsRoot,
  decodeCodexUsage,
  findSessionFile,
} from "./codex-session.js"
import type { ExecutionContext } from "./context.js"
import { eventSchema, type Feedback, observedOutput } from "./feedback.js"
import { geminiEvent, geminiStep } from "./gemini.js"
import { RoundOutput } from "./output.js"
import { phaseSelection } from "./output-format.js"
import { type Assistant, assistants, defaultModel } from "./phase.js"
import { claudeSettingsRequest } from "./requests.js"
import { RunClock } from "./run-clock.js"
import { defaultSettings } from "./settings.js"
import type { Terminal } from "./terminal.js"

const contractEnding = `Do not read or edit repository files. Return the supplied schema with status finished, reason null, settling null and closingNote "CLI contract probe complete."`
const contractProbes = `This is a CLI contract recording, not a repository task. Use your shell tool twice, sequentially: first run printf audit-round-probe, then run sh -c "echo audit-round-probe-error >&2; exit 7". The deliberate command failure is the probe, so do not repair anything.`
/**
 * The Claude probe also ends a turn on a background command, so the recording
 * holds one result per turn as the CLI's print mode emits them.
 */
export function contractPrompt(assistant: Assistant): string {
  switch (assistant) {
    case "codex":
    case "gemini":
      return `${contractProbes} ${contractEnding}`
    case "claude":
      return `${contractProbes} Then run sleep 2 with your shell tool's background option and end your turn at once with the single sentence: Waiting for the probe sleep. If asked for structured output before the task notification arrives, keep waiting in text. Return the object only after the notification. ${contractEnding}`
  }
}
export const contractResumePrompt = `This is the resumed half of a CLI contract recording, not a repository task. Use your shell tool once to run printf audit-round-resume-probe. ${contractEnding}`

/** Keep consumed events while excluding unrelated initialisation and configuration. */
function selectRecord(
  assistant: Assistant,
  value: unknown,
): unknown | undefined {
  switch (assistant) {
    case "gemini": {
      const { event, conversation_id, init, step_update, result } =
        geminiEvent.parse(value)
      switch (event) {
        case "init":
          return {
            event,
            conversation_id,
            init: z.object({ model: z.string() }).parse(init),
          }
        case "step_update": {
          const step = geminiStep.parse(step_update)
          return step.step_type === "agent_response" ||
            step.step_type === "tool"
            ? { event, conversation_id, step_update: step }
            : undefined
        }
        case "result": {
          const { json_schema: _, ...kept } = z
            .record(z.string(), z.unknown())
            .parse(result)
          return { event, conversation_id, result: kept }
        }
        default:
          return undefined
      }
    }
    case "codex": {
      const event = eventSchema.parse(value)
      if (
        ["thread.started", "turn.completed", "turn.failed", "error"].includes(
          event.type,
        )
      )
        return event
      if (["item.started", "item.completed"].includes(event.type)) {
        const item = eventSchema.parse(event.item)
        if (
          [
            "agent_message",
            "command_execution",
            "mcp_tool_call",
            "web_search",
            "file_change",
          ].includes(item.type)
        )
          return event
      }
      return undefined
    }
    case "claude": {
      const event = eventSchema.parse(value)
      if (event.parent_tool_use_id != null) return undefined
      if (["assistant", "user", "result"].includes(event.type)) return event
      if (event.type === "system" && event.subtype === "init")
        return {
          type: event.type,
          subtype: event.subtype,
          session_id: event.session_id,
        }
      if (event.type === "control_response") {
        const { request_id } = z
          .object({ request_id: z.string() })
          .parse(event.response)
        if (request_id === claudeSettingsRequest.request_id) {
          const response = z
            .object({
              request_id: z.string(),
              subtype: z.string(),
              response: z.object({ applied: z.unknown() }),
            })
            .parse(event.response)
          return { type: event.type, response }
        }
      }
      return undefined
    }
  }
}

function shellProbe(
  assistant: Assistant,
  detail: Record<string, unknown>,
): "success" | "failure" | undefined {
  switch (assistant) {
    case "claude":
    case "codex": {
      const text = JSON.stringify(detail)
      if (
        (detail.is_error === true || detail.exit_code === 7) &&
        text.includes("audit-round-probe-error")
      )
        return "failure"
      if (
        detail.is_error !== true &&
        (assistant === "claude" || detail.exit_code === 0) &&
        text.includes("audit-round-probe")
      )
        return "success"
      return undefined
    }
    case "gemini": {
      const { output } = detail
      if (typeof output !== "string") return undefined
      if (
        output.includes("Command exited with code 7.") &&
        output.includes("audit-round-probe-error")
      )
        return "failure"
      if (
        output.includes("Command exited with code 0.") &&
        /\baudit-round-probe\b(?!-)/.test(output)
      )
        return "success"
      return undefined
    }
  }
}

async function recordUsage(
  runtime: AssistantRuntime,
  sessionId: string,
  destination: string,
  start = 0,
): Promise<number> {
  const path = await findSessionFile(codexSessionsRoot(runtime), sessionId)
  if (path === undefined) throw new Error("Contract session file is missing")
  const size = (await stat(path)).size
  const stream = createReadStream(path, { start })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      const event = eventSchema.parse(JSON.parse(line))
      const feedback = decodeCodexUsage(event)
      const model = feedback.find((item) => item.type === "model")
      if (model?.type === "model")
        await appendFile(
          destination,
          `${JSON.stringify({ type: "turn_context", payload: model.selection })}\n`,
        )
      const context = feedback.find((item) => item.type === "context")
      const tokens = feedback.find((item) => item.type === "tokens")
      if (context?.type === "context")
        await appendFile(
          destination,
          `${JSON.stringify({
            type: "event_msg",
            payload: {
              type: "token_count",
              info: {
                last_token_usage: { input_tokens: context.tokens },
                model_context_window: context.window,
                ...(tokens?.type === "tokens" &&
                tokens.update.kind === "selected-model"
                  ? {
                      total_token_usage: {
                        input_tokens: tokens.update.tokens.input,
                        cached_input_tokens: tokens.update.tokens.cached,
                        output_tokens: tokens.update.tokens.output,
                      },
                    }
                  : {}),
              },
            },
          })}\n`,
        )
    }
  } finally {
    lines.close()
    stream.destroy()
  }
  return size
}

export async function recordContracts(
  selected: Assistant | "all",
  runtime: AssistantRuntime & ExecutionContext,
  fixturesRoot: string,
  terminal: Terminal,
): Promise<void> {
  const { cwd, repoEduRoot, planRoot, activeRoot, evidenceRoot, roundRoot } =
    runtime
  const context = {
    cwd,
    repoEduRoot,
    planRoot,
    activeRoot,
    evidenceRoot,
    roundRoot,
    roundKind: "implementation" as const,
  }
  const scratch = await mkdtemp(join(tmpdir(), "audit-round-ts-contract-"))
  try {
    const files: string[] = []
    for (const assistant of selected === "all" ? assistants : [selected]) {
      terminal.write(`Recording ${assistant} contract...`)
      // The probe runs on the built-in default selection, as written.
      const model = defaultModel(assistant, defaultSettings)
      const selection = phaseSelection(model, new Map())
      const output = new RoundOutput(
        {
          settings: defaultSettings,
          name: "CLI contract",
          title: `CLI contract for ${assistant}`,
          // The probe never waits for a ruling; the target only names it.
          target: `cli-contract-${assistant}`,
          phases: [{ phase: "fix", assistant, model }],
          releases: { claude: new Map(), codex: new Map(), gemini: new Map() },
          paths: {
            claim: null,
            log: join(scratch, `${assistant}.log`),
            markdown: join(scratch, `${assistant}.md`),
            mode: "wx",
          },
          previousModels: [],
          started: Date.now(),
        },
        { terminal, verbose: true, clock: new RunClock(Date.now) },
      )
      try {
        terminal.write(
          `Startup ${assistant}: ${selection.model} ${selection.effort}`,
        )
        const seen = {
          text: false,
          model: false,
          context: false,
          tokens: false,
          tool: false,
          failure: false,
          success: false,
          // Only the Claude probe must record a second turn.
          turns: assistant !== "claude",
          turnWithoutResult: assistant !== "claude",
        }
        let turnResults = 0
        const observe = async (event: Feedback) => {
          if (event.type === "text") seen.text = true
          if (event.type === "model") seen.model = true
          if (event.type === "context" && event.tokens > 0) seen.context = true
          if (event.type === "tokens") seen.tokens = true
          if (event.type === "tool") {
            if (event.stage === "started") seen.tool = true
            if (event.stage === "completed") {
              const detail = z
                .record(z.string(), z.unknown())
                .parse(event.detail)
              const probe = shellProbe(assistant, detail)
              if (probe !== undefined) seen[probe] = true
            }
          }
        }
        const result = await runAssistantInvocation(
          {
            phase: "fix",
            rulingFile: join(scratch, "ruling.md"),
            assistant,
            model,
            ...context,
            arguments: ["CLI contract probe"],
            sessionId: null,
          },
          {
            text: contractPrompt(assistant),
            log: contractPrompt(assistant),
            supplied: [],
          },
          observedOutput(output.phase, observe),
          runtime,
          async (record) => {
            const event = selectRecord(assistant, record)
            if (event === undefined) return
            if (assistant === "claude") {
              const kept = z
                .object({
                  type: z.string(),
                  num_turns: z.number().optional(),
                  structured_output: z.unknown().optional(),
                })
                .parse(event)
              if (kept.type === "result" && (kept.num_turns ?? 0) > 0) {
                turnResults += 1
                if (turnResults >= 2) seen.turns = true
                if (kept.structured_output === undefined)
                  seen.turnWithoutResult = true
              }
            }
            await appendFile(
              join(scratch, `${assistant}.jsonl`),
              `${JSON.stringify(event)}\n`,
            )
          },
        )
        if (result.status !== "finished")
          throw new Error(
            `${assistant} contract failed: ${result.status === "failed" ? result.reason : result.status}`,
          )
        let usageOffset = 0
        if (assistant === "codex") {
          usageOffset = await recordUsage(
            runtime,
            result.sessionId,
            join(scratch, "codex-rollout.jsonl"),
          )
          files.push("codex-rollout.jsonl")
        }
        const missing = Object.entries(seen)
          .filter(([, present]) => !present)
          .map(([name]) => name)
        if (missing.length > 0)
          throw new Error(
            `${assistant} contract missing evidence: ${missing.join(", ")}`,
          )
        let resumedTokens = false
        const resumed = await runAssistantInvocation(
          {
            phase: "fix",
            rulingFile: join(scratch, "ruling.md"),
            assistant,
            model,
            ...context,
            arguments: ["CLI contract probe"],
            sessionId: result.sessionId,
            rulingReply: "Resume the CLI contract probe.",
          },
          {
            text: contractResumePrompt,
            log: contractResumePrompt,
            supplied: [],
          },
          observedOutput(output.phase, (event) => {
            if (event.type === "tokens") resumedTokens = true
          }),
          runtime,
          async (record) => {
            const event = selectRecord(assistant, record)
            if (event !== undefined)
              await appendFile(
                join(scratch, `${assistant}-resume.jsonl`),
                `${JSON.stringify(event)}\n`,
              )
          },
        )
        if (resumed.status !== "finished")
          throw new Error(
            `${assistant} resumed contract failed: ${resumed.status === "failed" ? resumed.reason : resumed.status}`,
          )
        if (!resumedTokens)
          throw new Error(`${assistant} resumed contract missing token usage`)
        if (assistant === "codex") {
          await recordUsage(
            runtime,
            resumed.sessionId,
            join(scratch, "codex-rollout-resume.jsonl"),
            usageOffset,
          )
          files.push("codex-rollout-resume.jsonl")
        }
        await withCliProcess(
          runtime,
          assistant,
          ["--version"],
          "",
          async (child) => {
            await readCliLines(child, "stdout", (line) =>
              appendFile(
                join(scratch, `${assistant}-version.txt`),
                `${line}\n`,
              ),
            )
          },
          output.message,
        )
        if (
          !(
            await readFile(join(scratch, `${assistant}-version.txt`), "utf8")
          ).trim()
        )
          throw new Error(`${assistant} did not report a version`)
        files.push(
          `${assistant}.jsonl`,
          `${assistant}-resume.jsonl`,
          `${assistant}-version.txt`,
        )
      } finally {
        output.close()
      }
    }
    // No fixture is replaced until every selected assistant passed its actual boundary.
    await mkdir(fixturesRoot, { recursive: true })
    for (const file of files)
      await copyFile(join(scratch, file), join(fixturesRoot, file))
    await writeFile(
      join(fixturesRoot, "recorded-at.txt"),
      `Contract recorder: ${new Date().toISOString()}\n`,
    )
    terminal.write(`Contract passed; fixtures recorded in ${fixturesRoot}`)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
