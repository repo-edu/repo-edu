import { readdir, realpath, stat, unlink } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { execa } from "execa"
import type { ExecutionContext } from "./context.js"
import { type AuditTarget, planStem } from "./target.js"

type NamingTarget = ExecutionContext & AuditTarget

const phaseOrder = {
  round: 0,
  audit: 1,
  vet: 2,
  rebut: 3,
  fix: 4,
  brief: 5,
  ruling: 6,
  glance: 7,
  watch: 8,
} as const

export type FileKind = Exclude<keyof typeof phaseOrder, "fix" | "glance">

export function phaseFilename(
  nameStart: string,
  kind: FileKind,
  tag: string,
): string {
  return `${nameStart}-${phaseOrder[kind]}-${kind}.${tag}`
}

function readPhaseFilename(name: string): {
  nameStart: string
  kind: FileKind
  tag: string
  extension: string
} | null {
  const match =
    /^(.+-\d{2,})-(\d)-(round|audit|vet|rebut|brief|ruling|watch)\.([ao][btu][lmhx])\.(md|log)$/.exec(
      name,
    )
  if (match === null) return null
  const kind = match[3] as FileKind
  if (
    Number(match[2]) !== phaseOrder[kind] ||
    (match[5] === "log" && kind !== "round" && kind !== "brief")
  )
    return null
  return { nameStart: match[1], kind, tag: match[4], extension: match[5] }
}

async function phaseDocuments(root: string, kind: FileKind) {
  return (await readdir(root, { withFileTypes: true })).flatMap((file) => {
    const parsed = readPhaseFilename(file.name)
    return file.isFile() && parsed?.kind === kind && parsed.extension === "md"
      ? [{ path: join(root, file.name), ...parsed }]
      : []
  })
}

/** Close exactly one round's reports, using their recorded names, not today's settings. */
export async function closeRound(
  cwd: string,
  nameStart: string,
): Promise<void> {
  for (const file of await readdir(cwd, { withFileTypes: true })) {
    const parsed = readPhaseFilename(file.name)
    if (
      file.isFile() &&
      parsed?.nameStart === nameStart &&
      ["audit", "vet", "rebut"].includes(parsed.kind)
    )
      await unlink(join(cwd, file.name))
  }
}

async function targetDescription(target: NamingTarget): Promise<{
  label: string
  title: string
}> {
  if ("commits" in target) {
    const first = target.commits[0]
    const head = first.includes("HEAD")
      ? (
          await execa("git", ["rev-parse", "--short", "HEAD"], {
            cwd: target.cwd,
          })
        ).stdout
      : ""
    // Keep list filenames bounded; the title and phase arguments carry every reference.
    return {
      label: `${first.replaceAll("HEAD", head)}${target.commits.length === 1 ? "" : `-plus-${target.commits.length - 1}`}`,
      title: `commits ${target.commits.join(" ")}`,
    }
  }
  const stem = planStem(target.plan)
  if (target.roundKind === "planning")
    return { label: stem, title: `plan ${target.plan}` }
  const scope =
    target.scope === undefined
      ? "all"
      : `${target.scope.includes("-") ? "steps" : "step"}-${target.scope}`
  return {
    label: `${stem}-${scope}`,
    title: `implementation ${target.plan} ${target.scope ?? "all"}`,
  }
}

/** Read every retained kind at both roots; opening the run claims this candidate. */
async function nextNameStart(
  context: ExecutionContext,
  target: string,
): Promise<string> {
  const roots = await Promise.all(
    [context.repoEduRoot, context.planRoot].map((root) =>
      readdir(root, { withFileTypes: true }),
    ),
  )
  const numbers = roots
    .flat()
    .filter((file) => file.isFile())
    .map((file) => file.name)
    .filter((name) => name.startsWith(`${target}-`))
    .map((name) => {
      const suffix = name.slice(target.length + 1)
      const claim = /^(\d{2,})-claim\.md$/.exec(suffix)
      if (claim !== null) return Number(claim[1])
      const parsed = readPhaseFilename(name)
      const number = parsed?.nameStart.slice(target.length + 1)
      return number !== undefined && /^\d{2,}$/.test(number)
        ? Number(number)
        : 0
    })
  const next = Math.max(0, ...numbers) + 1
  if (!Number.isSafeInteger(next))
    throw new Error(`Round number exhausted for ${target}`)
  return `${target}-${String(next).padStart(2, "0")}`
}

/** Both entry routes allocate through the same target and retained-file rules. */
export async function roundIdentity(
  setup: NamingTarget,
): Promise<{ nameStart: string; title: string }> {
  const target = await targetDescription(setup)
  return {
    nameStart: await nextNameStart(setup, target.label),
    title: target.title,
  }
}

/** A later writer reuses the transcript's target and number, replacing its tag and kind. */
export function transcriptNameStart(transcript: string): string {
  const parsed = readPhaseFilename(basename(transcript))
  if (parsed?.kind !== "round" || parsed.extension !== "md")
    throw new Error(
      "Name a round's *-0-round.<tag>.md transcript at the Repo Edu or plan checkout root.",
    )
  return parsed.nameStart
}

/** Read an existing phase document at either checkout root. */
export async function roundDocument(
  context: ExecutionContext,
  file: string,
  kind: FileKind,
): Promise<{ path: string; nameStart: string }> {
  try {
    const path = await realpath(resolve(context.cwd, file))
    const parsed = readPhaseFilename(basename(path))
    if (
      (await stat(path)).isFile() &&
      [context.repoEduRoot, context.planRoot].includes(dirname(path)) &&
      parsed?.kind === kind &&
      parsed.extension === "md"
    )
      return { path, nameStart: parsed.nameStart }
  } catch {
    // Report the required document form below when the input cannot be opened.
  }
  throw new Error(
    `Name a round's *-${phaseOrder[kind]}-${kind}.<tag>.md ${kind === "round" ? "transcript" : "report"} at the Repo Edu or plan checkout root: ${file}`,
  )
}

export type ManualPhase = "vet" | "rebut" | "fix" | "brief"

/** Resolve one existing round without claiming it or consulting future writers' settings. */
export async function manualPhasePaths(
  context: ExecutionContext,
  phase: ManualPhase,
  input: string | undefined,
  options: {
    readonly writer?: string
    readonly vet?: string
    readonly rebut?: string
  },
): Promise<readonly string[]> {
  if (phase !== "fix" && options.writer === undefined)
    throw new Error(
      `The ${phase} phase needs --writer with the current session's full tag.`,
    )
  const kind = phase === "brief" ? "round" : "audit"
  if (input === undefined) {
    const matches = (await phaseDocuments(context.cwd, kind))
      .filter((document) => {
        const sameAssistant = document.tag[0] === options.writer?.[0]
        if (phase === "vet") return !sameAssistant
        if (phase === "rebut") return sameAssistant
        return true
      })
      .map((document) => document.path)
      .sort()
    const description = phase === "brief" ? "round transcript" : "audit report"
    if (matches.length === 0)
      throw new Error(
        `No eligible ${description} for ${phase} at ${context.cwd}. Supply an input path.`,
      )
    if (matches.length > 1)
      throw new Error(
        `Several eligible ${description}s for ${phase}. Supply an input path:\n${matches.join("\n")}`,
      )
    input = matches[0]
  }
  const source = await roundDocument(context, input, kind)
  const root = dirname(source.path)
  const output = (kind: "vet" | "rebut" | "brief") => {
    if (options.writer === undefined)
      throw new Error(
        `The ${phase} phase needs --writer with the current session's full tag.`,
      )
    return join(
      root,
      `${phaseFilename(source.nameStart, kind, options.writer)}.md`,
    )
  }
  const twin = async (
    kind: "vet" | "rebut",
    supplied?: string,
  ): Promise<string | undefined> => {
    if (supplied !== undefined) {
      const chosen = await roundDocument(context, supplied, kind)
      if (
        dirname(chosen.path) !== root ||
        chosen.nameStart !== source.nameStart
      )
        throw new Error(
          `The ${kind} file belongs to another round: ${supplied}`,
        )
      return chosen.path
    }
    const matches = (await phaseDocuments(root, kind))
      .filter((document) => document.nameStart === source.nameStart)
      .map((document) => document.path)
      .sort()
    if (matches.length > 1)
      throw new Error(
        `Several ${kind} files belong to this round. Select one with --${kind}:\n${matches.join("\n")}`,
      )
    return matches[0]
  }
  if (phase === "vet" || phase === "brief") return [source.path, output(phase)]
  const vet = await twin("vet", options.vet)
  if (phase === "rebut") {
    if (vet === undefined)
      throw new Error(`No vet file for ${source.nameStart} at ${root}.`)
    return [source.path, vet, output("rebut")]
  }
  const rebut = await twin("rebut", options.rebut)
  return [
    source.path,
    ...[vet, rebut].filter((file): file is string => file !== undefined),
  ]
}
