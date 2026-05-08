import { readdirSync, readFileSync, type Stats, statSync } from "node:fs"
import { join } from "node:path"
import {
  LOG_BASENAME,
  QUOTA_EXHAUSTED_BASENAME,
  RATE_LIMITED_BASENAME,
  REVIEW_BASENAME,
  SETTINGS_BASENAME,
  STATE_BASENAME,
  TRACE_BASENAME,
  XTRACE_BASENAME,
} from "./constants"

const CONTEXT_OMIT = new Set([
  ".git",
  LOG_BASENAME,
  QUOTA_EXHAUSTED_BASENAME,
  RATE_LIMITED_BASENAME,
  REVIEW_BASENAME,
  SETTINGS_BASENAME,
  STATE_BASENAME,
  TRACE_BASENAME,
  XTRACE_BASENAME,
])

const FULL_TEXT_BUDGET_BYTES = 8_000

function countChar(s: string, c: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) if (s[i] === c) n++
  return n
}

function listPythonFiles(absPath: string): string[] {
  const result: string[] = []
  const walk = (rel: string): void => {
    const here = rel.length === 0 ? absPath : join(absPath, rel)
    let entries: import("node:fs").Dirent[]
    try {
      entries = readdirSync(here, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (CONTEXT_OMIT.has(entry.name)) continue
      const next = rel.length === 0 ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        walk(next)
      } else if (entry.isFile() && entry.name.endsWith(".py")) {
        result.push(next)
      }
    }
  }
  walk("")
  return result
}

export function pythonApiSummary(content: string): string {
  const lines = content.split("\n")
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^(def |async def |class )/.test(line)) {
      let signature = line
      let parens = countChar(line, "(") - countChar(line, ")")
      while (parens > 0 && i + 1 < lines.length) {
        i++
        signature += `\n${lines[i]}`
        parens += countChar(lines[i], "(") - countChar(lines[i], ")")
      }
      out.push(signature)
    } else if (/^__all__\s*=/.test(line)) {
      let value = line
      let brackets = countChar(line, "[") - countChar(line, "]")
      while (brackets > 0 && i + 1 < lines.length) {
        i++
        value += `\n${lines[i]}`
        brackets += countChar(lines[i], "[") - countChar(lines[i], "]")
      }
      out.push(value)
    }
    i++
  }
  return out.join("\n")
}

function moduleBlock(relPath: string, absFilePath: string): string {
  const content = readFileSync(absFilePath, "utf8")
  const bytes = Buffer.byteLength(content, "utf8")
  if (bytes <= FULL_TEXT_BUDGET_BYTES) {
    const body = content.replace(/\s+$/, "")
    return `### \`${relPath}\` (full)\n\n\`\`\`python\n${body}\n\`\`\``
  }
  const summary = pythonApiSummary(content).trim()
  const body = summary.length > 0 ? summary : "(no top-level public API)"
  return `### \`${relPath}\` (summary, ${bytes} bytes)\n\n\`\`\`python\n${body}\n\`\`\``
}

export function pythonRepoContext(
  absPath: string,
  excludePath: string,
): string {
  let stat: Stats
  try {
    stat = statSync(absPath)
  } catch {
    return "(no other Python files yet)"
  }
  if (!stat.isDirectory()) return "(no other Python files yet)"
  const files = listPythonFiles(absPath).filter((rel) => rel !== excludePath)
  if (files.length === 0) return "(no other Python files yet)"
  return files.map((rel) => moduleBlock(rel, join(absPath, rel))).join("\n\n")
}
