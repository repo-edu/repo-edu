import {
  createLlmTextClient,
  runClaudeCoder,
  runCodexFixtureCoder,
} from "@repo-edu/integrations-llm"
import type { FixtureModelSpec } from "@repo-edu/integrations-llm-catalog"
import type {
  LlmTextClient,
  LlmUsage,
} from "@repo-edu/integrations-llm-contract"
import { emit } from "./log"

const xtraceSink = (text: string): void => {
  emit(3, text)
}

let cachedClient: LlmTextClient | null = null

function getClient(): LlmTextClient {
  if (!cachedClient) {
    cachedClient = createLlmTextClient(undefined, { trace: xtraceSink })
  }
  return cachedClient
}

export async function generateText(
  spec: FixtureModelSpec,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ reply: string; usage: LlmUsage }> {
  return getClient().generateText({ spec, prompt, signal })
}

export type FixtureCoderRequest = {
  spec: FixtureModelSpec
  prompt: string
  cwd: string
  appendInstructions?: string
  signal?: AbortSignal
}

function assertNever(value: never): never {
  throw new Error(`unsupported fixture coder provider: ${String(value)}`)
}

export async function runFixtureCoder(
  request: FixtureCoderRequest,
): Promise<{ reply: string; usage: LlmUsage }> {
  switch (request.spec.provider) {
    case "claude":
      return runClaudeCoder({ ...request, trace: xtraceSink })
    case "codex":
      return runCodexFixtureCoder(
        {
          ...request,
          prompt: codexFixturePrompt(request.prompt),
          appendInstructions: codexFixtureInstructions(
            request.appendInstructions,
          ),
          trace: xtraceSink,
        },
        undefined,
      )
    default:
      return assertNever(request.spec.provider)
  }
}

function codexFixturePrompt(prompt: string): string {
  return prompt
    .replace(
      /Read `[^`]+` first\.\n\n/g,
      "The team working agreement is already included in your Codex instructions; do not read it from disk.\n\n",
    )
    .replace(
      "You cannot run shell commands. Inspect with Read / Glob / Grep, edit\nwith Edit / Write — do not try to run tests or any other Bash command.",
      "Use Codex-native repository inspection and file-change operations. If inspection requires shell, use only minimal read-only commands such as `rg`, `sed -n`, `ls`, `find`, or `cat`; do not run tests, git, package managers, Python, or write-capable commands.",
    )
    .replace(
      "You cannot run shell commands. Inspect with Read / Glob / Grep, edit\nwith Edit / Write. The coordinator commits your changes for you.",
      "Use Codex-native repository inspection and file-change operations. If inspection requires shell, use only minimal read-only commands such as `rg`, `sed -n`, `ls`, `find`, or `cat`. The coordinator commits your changes for you.",
    )
}

function codexFixtureInstructions(appendInstructions?: string): string {
  return [
    appendInstructions?.trim(),
    "Codex-specific fixture-coder contract:",
    "- Work as a one-shot patch engine for exactly this round, not as an exploratory coding assistant.",
    "- Do not call MCP discovery, web search, package managers, test runners, git, Python, or networked tools.",
    "- Treat the prompt's current project file list as authoritative enough to choose the edit target.",
    "- For build rounds, use the embedded target file and target file content as the starting point, then edit directly without shell inspection.",
    "- If the target file does not exist yet, create it directly.",
    "- Use shell inspection only when a later round truly needs existing file contents; keep it to one short pass with `rg --files`, `rg`, `sed -n`, `ls`, `find`, or `cat`.",
    "- Prefer one file-change batch. A second small cleanup batch is acceptable; repeated self-revision is not.",
    "- Do not narrate progress. Return one concise change summary followed immediately by the required DELETE:/COMMIT: trailer.",
    "- If the round cannot be completed within those bounds, make the smallest correct commit or end with `COMMIT: -`.",
  ]
    .filter((line): line is string => line !== undefined && line.length > 0)
    .join("\n")
}

export function emptyUsage(authMode: LlmUsage["authMode"] = "api"): LlmUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    wallMs: 0,
    authMode,
  }
}
