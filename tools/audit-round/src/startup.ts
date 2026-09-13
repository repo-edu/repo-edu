import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { ExecaError } from "execa"
import { compare, valid } from "semver"
import { z } from "zod"
import { readClaudeSettings } from "./claude.js"
import { type CliRuntime, readCliLines, withCliProcess } from "./cli-process.js"
import { readCodexSettings } from "./codex-settings.js"
import { errorMessage, type ModelSelection } from "./feedback.js"
import type { Assistant } from "./phase.js"

export type StartupOutput = {
  readonly message: (text: string) => Promise<void>
  readonly warning: (text: string) => Promise<void>
}

function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

/** An update can be retried; a failed output writer must stop the round. */
class UpdateCheckError extends Error {}

function codexVersion(text: string, prefix: string): string {
  const version = text.startsWith(prefix)
    ? valid(text.slice(prefix.length))
    : null
  if (version === null)
    throw new UpdateCheckError(`Invalid Codex version: ${text}`)
  return version
}

async function installedCodexVersion(
  runtime: CliRuntime,
  output: StartupOutput,
): Promise<string> {
  const lines: string[] = []
  await withCliProcess(
    runtime,
    "codex",
    ["--version"],
    "",
    (child) =>
      readCliLines(child, "stdout", async (line) => {
        lines.push(line)
      }),
    output.message,
  )
  return codexVersion(lines.join("\n").trim(), "codex-cli ")
}

async function latestCodexVersion(runtime: CliRuntime): Promise<string> {
  try {
    // This is the standalone installer's own latest-release channel.
    const response = await fetch(
      "https://releases.openai.com/codex/channels/latest",
      {
        signal: AbortSignal.any([
          AbortSignal.timeout(30_000),
          ...(runtime.signal === undefined ? [] : [runtime.signal]),
        ]),
      },
    )
    if (!response.ok)
      throw new Error(`Release lookup returned HTTP ${response.status}`)
    const release = z
      .object({ tag_name: z.string() })
      .parse(await response.json())
    return codexVersion(release.tag_name, "rust-v")
  } catch (error) {
    runtime.signal?.throwIfAborted()
    throw new UpdateCheckError(
      `Cannot check the latest Codex release: ${errorMessage(error)}`,
      { cause: error },
    )
  }
}

async function updateCodex(
  runtime: CliRuntime,
  output: StartupOutput,
): Promise<void> {
  const current = await installedCodexVersion(runtime, output)
  const latest = await latestCodexVersion(runtime)
  runtime.signal?.throwIfAborted()
  const difference = compare(current, latest)
  if (difference >= 0) {
    await output.message(
      difference === 0
        ? `Codex is up to date (${current})`
        : `Codex ${current} is newer than the latest release (${latest}); keeping the installed version`,
    )
    return
  }
  await output.message(`Updating Codex from ${current} to ${latest}...`)
  const installed = await installCodex(runtime, output, latest)
  await output.message(`Codex updated from ${current} to ${installed}`)
}

async function installCodex(
  runtime: CliRuntime,
  output: StartupOutput,
  latest: string,
): Promise<string> {
  // The installer announces success even when it changed nothing. Keep its
  // output for failure diagnostics; only the verified version proves an update.
  const diagnostics: string[] = []
  const record = async (line: string) => {
    diagnostics.push(line)
  }
  try {
    await withCliProcess(
      runtime,
      "codex",
      ["update"],
      "",
      (child) => readCliLines(child, "stdout", record),
      record,
    )
    const version = await installedCodexVersion(runtime, output)
    runtime.signal?.throwIfAborted()
    if (compare(version, latest) < 0)
      throw new UpdateCheckError(
        `Codex update was not verified: expected ${latest} or newer, but the command still reports ${version}`,
      )
    return version
  } catch (error) {
    if (diagnostics.length > 0) {
      await output.message("Codex updater diagnostics (update not verified):")
      for (const line of diagnostics) await output.message(line)
    }
    throw error
  }
}

export async function updateClis(
  runtime: CliRuntime,
  output: StartupOutput,
  cacheRoot: string,
  now = () => new Date(),
): Promise<void> {
  try {
    await mkdir(cacheRoot, { recursive: true })
  } catch (error) {
    await output.warning(
      `Cannot create update cache; skipping update checks: ${errorMessage(error)}`,
    )
    return
  }
  for (const assistant of ["claude", "codex"] as const) {
    const stamp = join(cacheRoot, assistant)
    try {
      if ((await readFile(stamp, "utf8")).split("\n")[0] === localDate(now()))
        continue
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        await output.warning(
          `Cannot read ${assistant} update date: ${errorMessage(error)}`,
        )
    }
    await output.message(`Checking ${assistant} updates...`)
    try {
      if (assistant === "codex") await updateCodex(runtime, output)
      else
        await withCliProcess(
          runtime,
          assistant,
          ["update"],
          "",
          async (child) => {
            await readCliLines(child, "stdout", output.message)
          },
          output.message,
        )
    } catch (error) {
      if (
        !(error instanceof ExecaError || error instanceof UpdateCheckError) ||
        runtime.signal?.aborted ||
        (error instanceof ExecaError && error.isCanceled)
      )
        throw error
      await output.warning(
        `${assistant} update failed; continuing and retrying next round: ${errorMessage(error)}`,
      )
      continue
    }
    try {
      await writeFile(stamp, `${localDate(now())}\n`)
    } catch (error) {
      await output.warning(
        `Cannot save ${assistant} update date: ${errorMessage(error)}`,
      )
    }
  }
}

/**
 * The one `audit-round` cache, shared with the Bash runner. It holds the CLI
 * update dates and the watch's own history, so both runs and watches survive
 * a checkout being cleaned.
 */
export function resolveCacheRoot(
  runtime: CliRuntime,
  cacheRoot?: string,
): string {
  return (
    cacheRoot ??
    join(
      runtime.env?.XDG_CACHE_HOME ??
        process.env.XDG_CACHE_HOME ??
        join(homedir(), ".cache"),
      "audit-round",
    )
  )
}

export async function prepareAssistants(
  runtime: CliRuntime,
  output: StartupOutput,
  options: { readonly cacheRoot?: string; readonly now?: () => Date } = {},
): Promise<Record<Assistant, ModelSelection>> {
  const cacheRoot = resolveCacheRoot(runtime, options.cacheRoot)
  await updateClis(runtime, output, cacheRoot, options.now)
  // Both update attempts finish before settings are read. Neither request starts an LLM turn.
  const claude = await readClaudeSettings(runtime, output.message)
  const codex = await readCodexSettings(runtime, output.message)
  return { claude, codex }
}
