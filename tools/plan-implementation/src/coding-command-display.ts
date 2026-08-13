import { basename } from "node:path"
import { parse } from "shell-quote"

const SUPPORTED_SHELLS = new Set(["bash", "sh", "zsh"])
const COMMAND_FLAGS = new Set(["-c", "-lc"])

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
