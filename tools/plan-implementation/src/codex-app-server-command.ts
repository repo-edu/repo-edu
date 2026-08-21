import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

export type CodexAppServerCommand = {
  readonly command: string
  readonly arguments: readonly string[]
}

type CodexAppServerCommandOptions = {
  readonly resolvePackageJson?: (specifier: string) => string
}

const moduleRequire = createRequire(import.meta.url)

export function resolveCodexAppServerCommand(
  options: CodexAppServerCommandOptions = {},
): CodexAppServerCommand {
  const packageJsonPath = (options.resolvePackageJson ?? moduleRequire.resolve)(
    "@openai/codex/package.json",
  )
  const launcherPath = join(dirname(packageJsonPath), "bin", "codex.js")
  if (!existsSync(launcherPath)) {
    throw new Error(
      `The official @openai/codex launcher does not exist at ${launcherPath}.`,
    )
  }
  return {
    command: process.execPath,
    arguments: [launcherPath, "app-server"],
  }
}
