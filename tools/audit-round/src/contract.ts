import { createReadStream } from "node:fs"
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { z } from "zod"
import { type AssistantRuntime, runAssistantInvocation } from "./assistant.js"
import { readClaudeSettings } from "./claude.js"
import { readCliLines, withCliProcess } from "./cli-process.js"
import { readCodexSettings } from "./codex-settings.js"
import { decodeCodexUsage, findSessionFile } from "./codex-usage.js"
import { eventSchema, type Feedback } from "./feedback.js"
import { RoundOutput } from "./output.js"
import type { Assistant } from "./phase.js"
import { claudeSettingsRequest } from "./requests.js"
import type { Terminal } from "./terminal.js"

export const contractPrompt = `This is a CLI contract recording, not a repository task. Use your shell tool twice, sequentially: first run printf audit-round-probe, then run sh -c "echo audit-round-probe-error >&2; exit 7". The deliberate command failure is the probe, so do not repair anything. Do not read or edit repository files. End with exactly this final line outside a code fence: PHASE RESULT: {"status":"finished","file":null,"reason":null}`

/** Keep consumed events while excluding unrelated initialisation and configuration. */
function selectRecord(
  assistant: Assistant,
  value: unknown,
): unknown | undefined {
  const event = eventSchema.parse(value)
  if (assistant === "codex") {
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

async function recordUsage(
  runtime: AssistantRuntime,
  sessionId: string,
  destination: string,
): Promise<void> {
  const sessionsRoot =
    runtime.sessionsRoot ??
    join(
      runtime.env?.CODEX_HOME ??
        process.env.CODEX_HOME ??
        join(homedir(), ".codex"),
      "sessions",
    )
  const path = await findSessionFile(sessionsRoot, sessionId)
  if (path === undefined) throw new Error("Contract session file is missing")
  const stream = createReadStream(path)
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      const event = eventSchema.parse(JSON.parse(line))
      const feedback = decodeCodexUsage(event)
      for (const item of feedback) {
        const selected =
          item.type === "model"
            ? { type: "turn_context", payload: item.selection }
            : {
                type: "event_msg",
                payload: {
                  type: "token_count",
                  info: {
                    last_token_usage: { input_tokens: item.tokens },
                    model_context_window: item.window,
                  },
                },
              }
        await appendFile(destination, `${JSON.stringify(selected)}\n`)
      }
    }
  } finally {
    lines.close()
    stream.destroy()
  }
}

export async function recordContracts(
  selected: Assistant | "both",
  runtime: AssistantRuntime,
  fixturesRoot: string,
  terminal: Terminal,
): Promise<void> {
  const scratch = await mkdtemp(join(tmpdir(), "audit-round-ts-contract-"))
  const assistants: readonly Assistant[] =
    selected === "both" ? ["claude", "codex"] : [selected]
  try {
    const files: string[] = []
    for (const assistant of assistants) {
      terminal.write(`Recording ${assistant} contract...`)
      const output = new RoundOutput(
        { repoRoot: scratch, plan: "CLI-contract", auditor: assistant },
        { terminal, verbose: true },
      )
      try {
        const selection = await (assistant === "claude"
          ? readClaudeSettings
          : readCodexSettings)(runtime, output.message)
        terminal.write(
          `Startup ${assistant}: ${selection.model} ${selection.effort}`,
        )
        const seen = {
          text: false,
          model: false,
          context: false,
          tool: false,
          failure: false,
          success: false,
        }
        const observe = async (event: Feedback) => {
          if (event.type === "text") seen.text = true
          if (event.type === "model") seen.model = true
          if (event.type === "context" && event.tokens > 0) seen.context = true
          if (event.type === "tool") {
            if (event.stage === "started") seen.tool = true
            if (event.stage === "completed") {
              const detail = z
                .record(z.string(), z.unknown())
                .parse(event.detail)
              const text = JSON.stringify(detail)
              if (
                (detail.is_error === true || detail.exit_code === 7) &&
                text.includes("audit-round-probe-error")
              )
                seen.failure = true
              if (
                detail.is_error !== true &&
                (assistant === "claude" || detail.exit_code === 0) &&
                text.includes("audit-round-probe")
              )
                seen.success = true
            }
          }
          await output.phase.observe(event)
        }
        const result = await runAssistantInvocation(
          {
            phase: "fix",
            assistant,
            cwd: runtime.cwd,
            ownerRoot: runtime.cwd,
            arguments: ["CLI contract probe"],
            sessionId: null,
          },
          contractPrompt,
          { ...output.phase, observe },
          runtime,
          async (record) => {
            const event = selectRecord(assistant, record)
            if (event !== undefined)
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
        const missing = Object.entries(seen)
          .filter(([, present]) => !present)
          .map(([name]) => name)
        if (missing.length > 0)
          throw new Error(
            `${assistant} contract missing evidence: ${missing.join(", ")}`,
          )
        if (assistant === "codex") {
          await recordUsage(
            runtime,
            result.sessionId,
            join(scratch, "codex-rollout.jsonl"),
          )
          files.push("codex-rollout.jsonl")
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
        files.push(`${assistant}.jsonl`, `${assistant}-version.txt`)
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
      `TypeScript contract recorder: ${new Date().toISOString()}\n`,
    )
    terminal.write(`Contract passed; fixtures recorded in ${fixturesRoot}`)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
