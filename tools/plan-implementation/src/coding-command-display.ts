import { basename } from "node:path"
import { parse } from "shell-quote"

const SUPPORTED_SHELLS = new Set(["bash", "sh", "zsh"])
const COMMAND_FLAGS = new Set(["-c", "-lc"])
const ENVIRONMENT_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

type CommandStatus = "failed" | "started" | "succeeded"

function preserveVariable(name: string): string {
  return `$${name}`
}

export function unwrapCodingCommand(command: string): string {
  let words: ReturnType<typeof parse>
  try {
    words = parse(command, preserveVariable)
  } catch {
    return command
  }

  const [program, flags, innerCommand] = words
  if (
    words.length !== 3 ||
    typeof program !== "string" ||
    !SUPPORTED_SHELLS.has(basename(program)) ||
    typeof flags !== "string" ||
    !COMMAND_FLAGS.has(flags) ||
    typeof innerCommand !== "string"
  ) {
    return command
  }
  return innerCommand
}

function commandWords(command: string): readonly string[] {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(unwrapCodingCommand(command), preserveVariable)
  } catch {
    return []
  }

  const words: string[] = []
  for (const part of parsed) {
    if (typeof part !== "string") break
    words.push(part)
  }
  while (words[0] !== undefined && ENVIRONMENT_ASSIGNMENT.test(words[0])) {
    words.shift()
  }
  return words
}

function lastPath(words: readonly string[]): string | null {
  return (
    words.findLast(
      (word, index) => index > 0 && word !== "--" && !word.startsWith("-"),
    ) ?? null
  )
}

function packageManagerActivity(words: readonly string[]): string {
  if (words.includes("test")) return "Run tests"
  if (words.includes("check")) return "Check repository"
  if (words.includes("typecheck")) return "Check TypeScript"
  if (words.includes("fix")) return "Fix repository"
  if (words.includes("install")) return "Install dependencies"
  if (words.includes("build:types")) return "Build generated types"
  return "Run package command"
}

function commandActivity(command: string): string {
  const words = commandWords(command)
  const program = words[0] === undefined ? "" : basename(words[0])
  const path = lastPath(words)

  switch (program) {
    case "rg":
    case "grep":
      return words.includes("--files") ? "List files" : "Search files"
    case "fd":
    case "find":
      return "Find files"
    case "cat":
    case "head":
    case "sed":
    case "tail":
      return path === null ? "Read files" : `Read ${path}`
    case "ls":
      return path === null ? "List files" : `List ${path}`
    case "wc":
      return path === null ? "Count content" : `Count ${path}`
    case "git":
      switch (words.find((word, index) => index > 0 && !word.startsWith("-"))) {
        case "diff":
          return "Inspect Git changes"
        case "log":
          return "Inspect Git history"
        case "show":
          return "Inspect Git commit"
        case "status":
          return "Inspect Git status"
        default:
          return "Run Git command"
      }
    case "npm":
    case "pnpm":
    case "yarn":
      return packageManagerActivity(words)
    case "node":
      return words.includes("--test") ? "Run tests" : "Run Node command"
    case "pwd":
      return "Show current directory"
    default: {
      const decoded = unwrapCodingCommand(command)
        .replaceAll(/\s+/g, " ")
        .trim()
      return `Run: ${decoded}`
    }
  }
}

export function codingCommandActivity(
  command: string,
  status: CommandStatus,
): string {
  const activity = commandActivity(command)
  if (status === "failed") return `Failed: ${activity}`
  if (status === "succeeded") return `Finished: ${activity}`
  return activity
}
