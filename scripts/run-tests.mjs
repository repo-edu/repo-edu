import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { dirname, join, posix, resolve } from "node:path"

const workspaceGroups = new Set(["apps", "packages", "tools"])
const usage = "Usage: pnpm test [apps/<package> | packages/<package> | tools/<package>]"
const scriptPath = fileURLToPath(import.meta.url)
const workspaceRoot = resolve(dirname(scriptPath), "..")

export function createPnpmTestArguments(argv) {
  if (argv.length === 0) {
    return ["-r", "--stream", "--if-present", "run", "test"]
  }

  if (argv.length !== 1) {
    throw new Error(usage)
  }

  const target = posix
    .normalize(argv[0].replaceAll("\\", "/"))
    .replace(/\/+$/u, "")
  const relativeTarget = target.startsWith("./") ? target.slice(2) : target
  const segments = relativeTarget.split("/")

  if (
    segments.length !== 2 ||
    !workspaceGroups.has(segments[0]) ||
    !segments[1] ||
    segments[1] === "." ||
    segments[1] === ".." ||
    /[*?[\]{}!]/u.test(relativeTarget)
  ) {
    throw new Error(usage)
  }

  return [
    "--filter",
    `./${relativeTarget}`,
    "--fail-if-no-match",
    "run",
    "test",
  ]
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    stdio: "inherit",
  })

  if (result.error) {
    throw result.error
  }

  return result.status ?? 1
}

function runPnpm(args) {
  return run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args)
}

export function main(argv) {
  const pnpmArguments = createPnpmTestArguments(argv)

  if (argv.length === 0) {
    const commandTestStatus = run(process.execPath, [
      "--test",
      join(dirname(scriptPath), "run-tests.test.mjs"),
    ])
    if (commandTestStatus !== 0) {
      return commandTestStatus
    }
  }

  return runPnpm(pnpmArguments)
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
