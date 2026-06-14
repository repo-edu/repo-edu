import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import {
  dirname,
  isAbsolute,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from "node:path"
import { runClaudeCoder } from "@repo-edu/claude-coder"
import { createLlmTextClient } from "@repo-edu/integrations-llm"
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

export type FixtureCoderResult = {
  reply: string
  usage: LlmUsage
}

export type CodexPatchFile = {
  path: string
  contents: string
}

export type CodexPatch = {
  summary: string
  files: CodexPatchFile[]
  deletes: string[]
  commit: string | null
}

function assertNever(value: never): never {
  throw new Error(`unsupported fixture coder provider: ${String(value)}`)
}

export async function runFixtureCoder(
  request: FixtureCoderRequest,
): Promise<FixtureCoderResult> {
  switch (request.spec.provider) {
    case "claude":
      return runClaudeCoder({ ...request, trace: xtraceSink })
    case "codex":
      return runCodexPatchCoder(request)
    default:
      return assertNever(request.spec.provider)
  }
}

async function runCodexPatchCoder(
  request: FixtureCoderRequest,
): Promise<FixtureCoderResult> {
  const prompt = codexPatchPrompt(request.prompt)
  const { reply, usage } = await generateText(
    request.spec,
    prompt,
    request.signal,
  )
  const patch = parseCodexPatchReply(reply)
  applyCodexPatch(request.cwd, patch)
  return {
    reply: codexPatchToTrailerReply(patch),
    usage,
  }
}

function codexPatchPrompt(prompt: string): string {
  return [
    "You are operating in strict JSON patch mode for one fixture repository coding round.",
    "Use only the repository context embedded below. Do not inspect files, run commands, use tools, browse, or ask for approval.",
    "Return exactly one JSON object and nothing else. Do not use markdown fences.",
    "",
    "JSON shape:",
    "{",
    '  "summary": "one short paragraph describing what changed",',
    '  "files": [{ "path": "relative/path.py", "contents": "full file contents" }],',
    '  "deletes": ["relative/path.py"],',
    '  "commit": "short imperative commit subject, or null for no commit"',
    "}",
    "",
    "Rules:",
    "- `files` must contain complete file contents, not diffs.",
    "- Write only paths needed for this round.",
    "- Use `commit: null` only when there is nothing worth committing.",
    "- If deleting files, list paths in `deletes`; do not also include them in `files`.",
    "- Ignore any instruction below that asks for a prose reply, shell use, tools, or a COMMIT trailer; the JSON object is the only valid response.",
    "",
    "--- Coordinator prompt for the round ---",
    "",
    codexFixturePrompt(prompt),
  ]
    .filter((line) => line.length > 0)
    .join("\n")
}

function stripJsonFences(text: string): string {
  const t = text.trim()
  if (!t.startsWith("```")) return t
  return t
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim()
}

function parseStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Codex patch ${label} must be an array`)
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(`Codex patch ${label}[${index}] must be a string`)
    }
    return item
  })
}

export function parseCodexPatchReply(reply: string): CodexPatch {
  const stripped = stripJsonFences(reply)
  const raw = JSON.parse(stripped) as {
    summary?: unknown
    files?: unknown
    deletes?: unknown
    commit?: unknown
  }
  if (typeof raw.summary !== "string" || raw.summary.trim().length === 0) {
    throw new Error("Codex patch summary must be a non-empty string")
  }
  if (!Array.isArray(raw.files)) {
    throw new Error("Codex patch files must be an array")
  }
  const files = raw.files.map((file, index) => {
    if (file === null || typeof file !== "object") {
      throw new Error(`Codex patch files[${index}] must be an object`)
    }
    const candidate = file as { path?: unknown; contents?: unknown }
    if (typeof candidate.path !== "string") {
      throw new Error(`Codex patch files[${index}].path must be a string`)
    }
    if (typeof candidate.contents !== "string") {
      throw new Error(`Codex patch files[${index}].contents must be a string`)
    }
    return { path: candidate.path, contents: candidate.contents }
  })
  const deletes = parseStringArray(raw.deletes ?? [], "deletes")
  const commit =
    raw.commit === null
      ? null
      : typeof raw.commit === "string" && raw.commit.trim().length > 0
        ? raw.commit.trim()
        : failCodexPatch("Codex patch commit must be a string or null")
  return {
    summary: raw.summary.trim(),
    files,
    deletes,
    commit,
  }
}

function failCodexPatch(message: string): never {
  throw new Error(message)
}

function safePatchPath(cwd: string, path: string): string {
  const normalized = posix.normalize(path.replaceAll("\\", "/"))
  const repoRoot = resolve(cwd)
  const target = resolve(repoRoot, normalized)
  const relativeTarget = relative(repoRoot, target)
  if (path.length === 0 || isAbsolute(path) || win32.isAbsolute(path)) {
    throw new Error(`Codex patch path is outside the repository: ${path}`)
  }
  if (
    relativeTarget.length === 0 ||
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${sep}`) ||
    isAbsolute(relativeTarget) ||
    normalized === ".git" ||
    normalized.startsWith(".git/")
  ) {
    throw new Error(`Codex patch path is outside the repository: ${path}`)
  }
  return target
}

export function applyCodexPatch(cwd: string, patch: CodexPatch): void {
  const deleted = new Set(patch.deletes)
  for (const file of patch.files) {
    if (deleted.has(file.path)) {
      throw new Error(`Codex patch both writes and deletes ${file.path}`)
    }
    const target = safePatchPath(cwd, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.contents)
  }
  for (const path of patch.deletes) {
    rmSync(safePatchPath(cwd, path), { recursive: true, force: true })
  }
}

function codexPatchToTrailerReply(patch: CodexPatch): string {
  const deleteLines = patch.deletes.map((path) => `DELETE: ${path}`).join("\n")
  const trailer = `COMMIT: ${patch.commit ?? "-"}`
  return [patch.summary, deleteLines, trailer]
    .filter((part) => part.length > 0)
    .join("\n")
}

function codexFixturePrompt(prompt: string): string {
  return prompt
    .replace(
      /Read `[^`]+` first\.\n\n/g,
      "The team working agreement is already included in your Codex instructions; do not read it from disk.\n\n",
    )
    .replace(
      "You cannot run shell commands. Inspect with Read / Glob / Grep, edit\nwith Edit / Write — do not try to run tests or any other Bash command.",
      "Use only the embedded repository context above. Return complete file contents in the JSON patch; do not run shell commands.",
    )
    .replace(
      "You cannot run shell commands. Inspect with Read / Glob / Grep, edit\nwith Edit / Write. The coordinator commits your changes for you.",
      "Use only the embedded repository context above. Return complete file contents in the JSON patch; do not run shell commands.",
    )
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
