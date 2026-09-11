import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { ExecaError } from "execa"
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
        !(error instanceof ExecaError) ||
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

export async function prepareAssistants(
  runtime: CliRuntime,
  output: StartupOutput,
  options: { readonly cacheRoot?: string; readonly now?: () => Date } = {},
): Promise<Record<Assistant, ModelSelection>> {
  const cacheRoot =
    options.cacheRoot ??
    join(
      runtime.env?.XDG_CACHE_HOME ??
        process.env.XDG_CACHE_HOME ??
        join(homedir(), ".cache"),
      "audit-round",
    )
  await updateClis(runtime, output, cacheRoot, options.now)
  // Both update attempts finish before settings are read. Neither request starts an LLM turn.
  const claude = await readClaudeSettings(runtime, output.message)
  const codex = await readCodexSettings(runtime, output.message)
  return { claude, codex }
}
