import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

const commandsDir = resolve(repoRoot, "apps/repo-manage/src-tauri/src/commands")
const manifestPath = resolve(
  repoRoot,
  "apps/repo-manage/schemas/commands/manifest.json",
)

function readText(path: string): string {
  return readFileSync(path, "utf-8")
}

function listRustFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".rs"))
    .map((entry) => resolve(dir, entry))
}

function stripComments(line: string): string {
  const index = line.indexOf("//")
  if (index === -1) return line
  return line.slice(0, index)
}

function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = []
  let depthAngle = 0
  let depthParen = 0
  let depthBracket = 0
  let current = ""
  for (const char of input) {
    if (char === "<") depthAngle += 1
    if (char === ">") depthAngle = Math.max(0, depthAngle - 1)
    if (char === "(") depthParen += 1
    if (char === ")") depthParen = Math.max(0, depthParen - 1)
    if (char === "[") depthBracket += 1
    if (char === "]") depthBracket = Math.max(0, depthBracket - 1)
    if (
      char === delimiter &&
      depthAngle === 0 &&
      depthParen === 0 &&
      depthBracket === 0
    ) {
      parts.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  if (current.trim().length > 0) {
    parts.push(current.trim())
  }
  return parts
}

function parseResultType(returnType: string): {
  okType: string
  errType: string | null
} {
  const normalized = returnType.replace(/\s+/g, " ").trim()
  const resultMatch = normalized.match(/(?:^|::)Result\s*<(.+)>$/)
  if (!resultMatch) {
    return { okType: normalized, errType: null }
  }
  const inner = resultMatch[1]
  const args = splitTopLevel(inner, ",")
  const okType = args[0]?.trim() ?? "()"
  const errType = args[1]?.trim() ?? null
  return { okType, errType }
}

type CommandEntry = {
  input: { name: string; type: string }[]
  output: string
  error: string | null
}

function parseCommandsFromFile(filePath: string): Map<string, CommandEntry> {
  const content = readText(filePath)
  const lines = content.split("\n")
  const commands = new Map<string, CommandEntry>()

  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes("#[tauri::command")) continue
    let signature = ""
    let j = i + 1
    while (j < lines.length && !lines[j].includes("fn ")) {
      j += 1
    }
    if (j >= lines.length) continue

    signature += stripComments(lines[j]).trim()
    while (j + 1 < lines.length && !signature.includes("{")) {
      j += 1
      signature += ` ${stripComments(lines[j]).trim()}`
    }

    signature = signature.split("{")[0].trim()
    const fnMatch = signature.match(
      /fn\s+([A-Za-z0-9_]+)\s*\((.*)\)\s*(?:->\s*(.*))?$/,
    )
    if (!fnMatch) continue

    const name = fnMatch[1]
    const params = fnMatch[2]?.trim() ?? ""
    const returnTypeRaw = fnMatch[3]?.trim() ?? "()"
    const paramList = params.length === 0 ? [] : splitTopLevel(params, ",")
    const inputs = paramList
      .map((param) => {
        const trimmed = param.trim()
        if (trimmed.length === 0) return null
        const match = trimmed.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+)$/)
        if (!match) return null
        return { name: match[1], type: match[2].trim() }
      })
      .filter((param): param is { name: string; type: string } =>
        Boolean(param),
      )

    const { okType, errType } = parseResultType(returnTypeRaw)

    commands.set(name, {
      input: inputs,
      output: okType,
      error: errType,
    })
  }

  return commands
}

type ManifestEntry = {
  input?: { name: string; type: string }[]
  output?: string
  error?: string | null
}

type Manifest = {
  commands?: Record<string, ManifestEntry>
}

function loadManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, "utf-8")) as Manifest
}

function compare(): { ok: boolean; warnings: string[] } {
  const files = listRustFiles(commandsDir)
  const parsed = new Map<string, CommandEntry>()
  for (const file of files) {
    const commands = parseCommandsFromFile(file)
    for (const [name, entry] of commands.entries()) {
      parsed.set(name, entry)
    }
  }

  if (!existsSync(manifestPath)) {
    console.warn(
      "command parity: manifest.json not found (skipping parity check)",
    )
    return { ok: true, warnings: [] }
  }

  const manifest = loadManifest(manifestPath)
  const warnings: string[] = []

  for (const [name, entry] of parsed.entries()) {
    if (!manifest.commands?.[name]) {
      warnings.push(`Missing manifest entry for command: ${name}`)
      continue
    }
    const manifestEntry = manifest.commands[name]
    const manifestInput = manifestEntry.input ?? []
    if (manifestInput.length !== entry.input.length) {
      warnings.push(
        `Command ${name} input count mismatch: rust=${entry.input.length} manifest=${manifestInput.length}`,
      )
    }
    for (
      let i = 0;
      i < Math.min(manifestInput.length, entry.input.length);
      i += 1
    ) {
      const rustParam = entry.input[i]
      const manifestParam = manifestInput[i]
      if (
        rustParam.name !== manifestParam.name ||
        rustParam.type !== manifestParam.type
      ) {
        warnings.push(
          `Command ${name} param ${i + 1} mismatch: rust=${rustParam.name}:${rustParam.type} manifest=${manifestParam.name}:${manifestParam.type}`,
        )
      }
    }
    if (entry.output !== (manifestEntry.output ?? "()")) {
      warnings.push(
        `Command ${name} output mismatch: rust=${entry.output} manifest=${manifestEntry.output ?? "()"}`,
      )
    }
    if ((entry.error ?? null) !== (manifestEntry.error ?? null)) {
      warnings.push(
        `Command ${name} error mismatch: rust=${entry.error ?? "(none)"} manifest=${manifestEntry.error ?? "(none)"}`,
      )
    }
  }

  for (const name of Object.keys(manifest.commands ?? {})) {
    if (!parsed.has(name)) {
      warnings.push(`Manifest contains unknown command: ${name}`)
    }
  }

  return { ok: warnings.length === 0, warnings }
}

function main(): void {
  const { ok, warnings } = compare()
  if (!ok) {
    for (const warning of warnings) {
      console.warn(`command parity: ${warning}`)
    }
    process.exit(1)
  }
  console.log("command parity: OK")
}

main()
