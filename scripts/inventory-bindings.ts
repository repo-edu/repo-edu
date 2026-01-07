import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type CommandEntry = {
  name: string
  description: string
  inputs: { name: string; type: string }[]
  outputType: string
  errorType: string | null
  source: string
}

type TypeInventoryEntry = {
  name: string
  source: string
  serdeAttrs: string[]
  usage: "input" | "output" | "both" | "unused"
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

const bindingsPath = resolve(repoRoot, "apps/repo-manage/src/bindings/types.ts")
const tauriSrcDir = resolve(repoRoot, "apps/repo-manage/src-tauri/src")
const coreSrcDir = resolve(repoRoot, "apps/repo-manage/core/src")

const outputDoc = resolve(repoRoot, "docs/migration/schema-types.md")
const outputManifestStub = resolve(
  repoRoot,
  "apps/repo-manage/schemas/commands/manifest.stub.json",
)
const outputManifest = resolve(
  repoRoot,
  "apps/repo-manage/schemas/commands/manifest.json",
)

function toRepoRelative(path: string): string {
  if (!path.startsWith(repoRoot)) return path
  const rel = path.slice(repoRoot.length + 1)
  return rel.length > 0 ? rel : path
}

function collectFiles(dir: string, suffix: string): string[] {
  const results: string[] = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    const entries = readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = resolve(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile() && full.endsWith(suffix)) {
        results.push(full)
      }
    }
  }
  return results
}

function readText(path: string): string {
  return readFileSync(path, "utf-8")
}

function extractTypeNames(bindingsSource: string): string[] {
  const names = new Set<string>()
  const typeRegex = /export\s+type\s+([A-Za-z0-9_]+)/g
  const interfaceRegex = /export\s+interface\s+([A-Za-z0-9_]+)/g
  let match: RegExpExecArray | null = typeRegex.exec(bindingsSource)
  while (match) {
    names.add(match[1])
    match = typeRegex.exec(bindingsSource)
  }
  match = interfaceRegex.exec(bindingsSource)
  while (match) {
    names.add(match[1])
    match = interfaceRegex.exec(bindingsSource)
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b))
}

function collectSerdeAttrs(lines: string[], startIndex: number): string[] {
  const attrs: string[] = []
  for (let i = startIndex - 1; i >= 0; i -= 1) {
    const line = lines[i].trim()
    if (!line.startsWith("#[")) break
    if (line.includes("serde")) {
      attrs.unshift(line)
    }
  }
  return attrs
}

function findTypeDefinitions(
  typeNames: string[],
  rustFiles: string[],
): Map<string, { source: string; serdeAttrs: string[] }> {
  const nameSet = new Set(typeNames)
  const results = new Map<string, { source: string; serdeAttrs: string[] }>()
  for (const filePath of rustFiles) {
    const content = readText(filePath)
    const lines = content.split("\n")
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      const match = line.match(
        /\b(?:pub\s+)?(struct|enum|type)\s+([A-Za-z0-9_]+)\b/,
      )
      if (!match) continue
      const name = match[2]
      if (!nameSet.has(name) || results.has(name)) continue
      const serdeAttrs = collectSerdeAttrs(lines, i)
      results.set(name, {
        source: toRepoRelative(filePath),
        serdeAttrs,
      })
    }
  }
  return results
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

function parseCommandsFromFile(filePath: string): CommandEntry[] {
  const content = readText(filePath)
  const lines = content.split("\n")
  const commands: CommandEntry[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.includes("#[tauri::command")) continue

    const docLines: string[] = []
    for (let d = i - 1; d >= 0; d -= 1) {
      const docLine = lines[d].trim()
      if (!docLine.startsWith("///")) break
      docLines.unshift(docLine.replace(/^\/\/\/\s?/, ""))
    }
    const description = docLines.join("\n")

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

    commands.push({
      name,
      description,
      inputs,
      outputType: okType,
      errorType: errType,
      source: toRepoRelative(filePath),
    })
  }

  return commands
}

function collectCommands(commandDir: string): CommandEntry[] {
  const rustFiles = collectFiles(commandDir, ".rs")
  const commands: CommandEntry[] = []
  for (const filePath of rustFiles) {
    commands.push(...parseCommandsFromFile(filePath))
  }
  return commands
}

function inferTypeUsage(
  typeNames: string[],
  commands: CommandEntry[],
): Map<string, "input" | "output" | "both" | "unused"> {
  const usage = new Map<string, "input" | "output" | "both" | "unused">()
  for (const name of typeNames) {
    usage.set(name, "unused")
  }

  for (const command of commands) {
    for (const input of command.inputs) {
      for (const name of typeNames) {
        if (input.type.includes(name)) {
          const current = usage.get(name)
          if (current === "output") usage.set(name, "both")
          else usage.set(name, "input")
        }
      }
    }
    for (const name of typeNames) {
      if (command.outputType.includes(name)) {
        const current = usage.get(name)
        if (current === "input") usage.set(name, "both")
        else usage.set(name, "output")
      }
      if (command.errorType?.includes(name)) {
        const current = usage.get(name)
        if (current === "input") usage.set(name, "both")
        else usage.set(name, "output")
      }
    }
  }

  return usage
}

function formatSerdeAttrs(attrs: string[]): string {
  if (attrs.length === 0) return "(none)"
  return attrs.join(" ")
}

function writeInventoryDoc(
  entries: TypeInventoryEntry[],
  commands: CommandEntry[],
): void {
  const lines: string[] = []
  lines.push("# Schema Type Inventory")
  lines.push("")
  lines.push(
    "Usage indicates direct appearance in Tauri command signatures (nested usage is not inferred).",
  )
  lines.push("")
  for (const entry of entries) {
    lines.push(
      `- [ ] ${entry.name} | source: ${entry.source} | serde: ${formatSerdeAttrs(
        entry.serdeAttrs,
      )} | usage: ${entry.usage}`,
    )
  }
  lines.push("")
  lines.push("# Command Inventory")
  lines.push("")
  lines.push("| Command | Input Types | Output Type | Error Type | Source |")
  lines.push("| --- | --- | --- | --- | --- |")
  for (const command of commands) {
    const inputList =
      command.inputs.length > 0
        ? command.inputs
            .map((input) => `${input.name}: ${input.type}`)
            .join(", ")
        : "(none)"
    lines.push(
      `| ${command.name} | ${inputList} | ${command.outputType || "()"} | ${
        command.errorType ?? "(none)"
      } | ${command.source} |`,
    )
  }

  mkdirSync(dirname(outputDoc), { recursive: true })
  writeFileSync(outputDoc, lines.join("\n"))
}

function writeManifestStub(commands: CommandEntry[]): void {
  const manifest = {
    commands: Object.fromEntries(
      commands.map((command) => [
        command.name,
        {
          description: command.description || undefined,
          input: command.inputs,
          output: command.outputType,
          error: command.errorType,
        },
      ]),
    ),
  }

  mkdirSync(dirname(outputManifestStub), { recursive: true })
  writeFileSync(outputManifestStub, `${JSON.stringify(manifest, null, 2)}\n`)

  const manifestWithSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...manifest,
  }
  writeFileSync(
    outputManifest,
    `${JSON.stringify(manifestWithSchema, null, 2)}\n`,
  )
}

function main(): void {
  const bindingsSource = readText(bindingsPath)
  const typeNames = extractTypeNames(bindingsSource)

  const rustFiles = [
    ...collectFiles(tauriSrcDir, ".rs"),
    ...collectFiles(coreSrcDir, ".rs"),
  ]
  const typeDefs = findTypeDefinitions(typeNames, rustFiles)
  const commands = collectCommands(resolve(tauriSrcDir, "commands"))
  const usage = inferTypeUsage(typeNames, commands)

  const entries: TypeInventoryEntry[] = typeNames.map((name) => {
    const def = typeDefs.get(name)
    return {
      name,
      source: def ? def.source : "(not found)",
      serdeAttrs: def ? def.serdeAttrs : [],
      usage: usage.get(name) ?? "unused",
    }
  })

  writeInventoryDoc(entries, commands)
  writeManifestStub(commands)

  console.log(`Wrote ${entries.length} type entries to ${outputDoc}`)
  console.log(`Wrote ${commands.length} commands to ${outputManifest}`)
}

main()
