import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PROMPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "prompts")

function substitute(
  text: string,
  ctx: Record<string, string>,
  ref: string,
): string {
  const resolved = text.replace(
    /\{\{\s*([\w-]+)\s*\}\}/g,
    (match, key: string) => {
      if (key in ctx) return ctx[key]
      throw new Error(
        `prompt "${ref}" references missing placeholder: ${match}`,
      )
    },
  )
  const leftover = resolved.match(/\{\{[^}]*\}\}/)
  if (leftover) {
    throw new Error(
      `prompt "${ref}" has unresolved placeholder: ${leftover[0]}`,
    )
  }
  return resolved.replace(/\n{3,}/g, "\n\n")
}

function readPromptFile(name: string): string {
  return readFileSync(resolve(PROMPTS_DIR, `${name}.md`), "utf8")
}

export function loadPrompt(
  name: string,
  ctx: Record<string, string> = {},
): string {
  return substitute(readPromptFile(name), ctx, name)
}

export function loadSection(
  name: string,
  section: string,
  ctx: Record<string, string> = {},
): string {
  const raw = readPromptFile(name)
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const header = new RegExp(`^##\\s+${escaped}\\s*$`, "m")
  const match = raw.match(header)
  if (!match || match.index === undefined) {
    throw new Error(`prompt "${name}" has no section "${section}"`)
  }
  const start = match.index + match[0].length
  const next = raw.slice(start).search(/^##\s/m)
  const end = next >= 0 ? start + next : raw.length
  const body = raw.slice(start, end).trim()
  return substitute(body, ctx, `${name}#${section}`)
}
