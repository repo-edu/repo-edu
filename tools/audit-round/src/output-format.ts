import { split } from "shellwords"
import type { Feedback, ModelSelection } from "./feedback.js"

export type Context = Extract<Feedback, { type: "context" }>

export function modelText(selection: ModelSelection): string {
  const effort = selection.effort === "xhigh" ? "extra high" : selection.effort
  return `${selection.model} ${effort ?? "effort unavailable"}`
}

export function tokenText(tokens: number, decimals = 0): string {
  const magnitude = Math.round(Math.abs(tokens) / (decimals === 0 ? 1000 : 100))
  const number = (magnitude / 10 ** decimals).toFixed(decimals)
  return `${tokens < 0 && magnitude > 0 ? "-" : ""}${number}k`
}

export function contextChange(
  context: Context,
  previous: number | null,
): string {
  if (previous === null) return "--"
  const change = tokenText(context.tokens - previous, 1)
  return change === "0.0k" ? "" : change
}

export function contextText(context: Context | null, change: string): string {
  if (context === null) return ""
  const percent =
    context.window === null
      ? ""
      : `  ${Math.round((context.tokens / context.window) * 100)}%`
  return `context  ${change}  ${tokenText(context.tokens)}${percent}`
}

export function elapsedText(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

/** Decode only the recognised outer invocation. Shellwords never executes text. */
export function commandText(command: string): string {
  if (command.startsWith("/bin/zsh ") || command.startsWith("zsh ")) {
    try {
      const words = split(command)
      if (words.length === 3 && (words[1] === "-lc" || words[1] === "-c"))
        command = words[2]
    } catch {
      // Unrecognised display text remains intact in the record.
    }
  }
  return command.replace(/[\r\n\t]/g, " ")
}

export function toolText(
  invocation: string,
  context: Context | null,
  change: string,
): string {
  const total = context === null ? "--" : tokenText(context.tokens)
  const percent =
    context?.window == null
      ? "--"
      : `${Math.round((context.tokens / context.window) * 100)}%`
  return `${change.padStart(9)}  ${total.padStart(7)}  ${percent.padStart(4)}  ${invocation.replace(/[\r\n\t]/g, " ")}`
}

export function toolInputText(input: Record<string, unknown>): string {
  for (const key of [
    "command",
    "file_path",
    "path",
    "pattern",
    "skill",
    "description",
  ]) {
    const value = input[key]
    if (typeof value === "string")
      return key === "command" ? commandText(value) : value
  }
  return JSON.stringify(input)
}
