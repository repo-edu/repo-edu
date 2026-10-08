import { readdir, readFile, realpath, stat, unlink } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { execa } from "execa"
import type { ExecutionContext } from "./context.js"
import { type AuditTarget, planStem, type RoundKind } from "./target.js"

type NamingTarget = ExecutionContext & AuditTarget

const phaseOrder = {
  round: 1,
  audit: 2,
  vet: 3,
  rebut: 4,
  fix: 5,
  brief: 6,
  ruling: 7,
  glance: 8,
  watch: 9,
} as const

export type FileKind = Exclude<keyof typeof phaseOrder, "fix" | "glance">

/** Tagless phase-change markers that take a round number so they sort among the rounds. */
export const markerKinds = ["settle", "reopen"] as const

export type MarkerKind = (typeof markerKinds)[number]

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
  extension: "md" | "log" | "json"
} | null {
  const match =
    /^(.+-\d{2,})-(\d)-(round|audit|vet|rebut|brief|ruling|watch)\.([ao][btu][lmhx])\.(md|log|json)$/.exec(
      name,
    )
  if (match === null) return null
  const kind = match[3] as FileKind
  if (
    Number(match[2]) !== phaseOrder[kind] ||
    (match[5] === "log" && kind !== "round" && kind !== "brief") ||
    (match[5] === "json" && kind !== "round")
  )
    return null
  return {
    nameStart: match[1],
    kind,
    tag: match[4],
    extension: match[5] as "md" | "log" | "json",
  }
}

async function phaseDocuments(root: string, kind: FileKind) {
  return (await readdir(root, { withFileTypes: true })).flatMap((file) => {
    const parsed = readPhaseFilename(file.name)
    return file.isFile() && parsed?.kind === kind && parsed.extension === "md"
      ? [{ path: join(root, file.name), ...parsed }]
      : []
  })
}

/**
 * Delete exactly one round's reports, using their recorded names, not today's settings.
 * Returns the deleted filenames.
 */
export async function deleteRoundReports(
  cwd: string,
  nameStart: string,
): Promise<readonly string[]> {
  const deleted: string[] = []
  for (const file of await readdir(cwd, { withFileTypes: true })) {
    const parsed = readPhaseFilename(file.name)
    if (
      file.isFile() &&
      parsed?.nameStart === nameStart &&
      ["audit", "vet", "rebut"].includes(parsed.kind)
    ) {
      await unlink(join(cwd, file.name))
      deleted.push(file.name)
    }
  }
  return deleted
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
            cwd: target.repoEduRoot,
          })
        ).stdout
      : ""
    // Keep list filenames bounded; the title and phase arguments carry every reference.
    return {
      label: `${first.replaceAll("HEAD", head)}${target.commits.length === 1 ? "" : `-plus-${target.commits.length - 1}`}`,
      title: `Commit audit of ${target.commits.join(" ")}`,
    }
  }
  const stem = planStem(target.plan)
  if (target.roundKind === "planning")
    return { label: `${stem}-plan`, title: `Plan audit of ${target.plan}` }
  // Padded `first..last` scopes sort the same in `ls` and Finder and keep the
  // round and phase numbers aligned, since a single step is a one-step range.
  const [first, last = first] = target.scope
    .split("-")
    .map((step) => step.padStart(2, "0"))
  const scope = target.scope === "all" ? "all" : `${first}..${last}`
  const steps =
    target.scope === "all"
      ? "all steps"
      : `${target.scope.includes("-") ? "steps" : "step"} ${target.scope}`
  return {
    label: `${stem}-impl-${scope}`,
    title: `Implementation audit of ${target.plan}, ${steps}`,
  }
}

/** Read every retained kind at the plan root; opening the run claims this candidate. */
async function nextNameStart(
  context: ExecutionContext,
  target: string,
): Promise<string> {
  const files = await readdir(context.planRoot, { withFileTypes: true })
  const numbers = files
    .filter((file) => file.isFile())
    .map((file) => file.name)
    .filter((name) => name.startsWith(`${target}-`))
    .map((name) => {
      const suffix = name.slice(target.length + 1)
      const claim = /^(\d{2,})-0-(claim|settle|reopen)\.md$/.exec(suffix)
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

/**
 * A phase-change marker claims the plan target's next number, so the file list
 * shows where a settle or reopen fell among the rounds without opening a file.
 */
export async function markerPath(
  context: ExecutionContext,
  plan: string,
  kind: MarkerKind,
): Promise<string> {
  const { nameStart } = await roundIdentity({
    ...context,
    roundKind: "planning",
    plan,
  })
  return join(context.planRoot, `${nameStart}-0-${kind}.md`)
}

/** The editable list of auditors still to run on this target, beside its rounds. */
export async function queueFile(setup: NamingTarget): Promise<string> {
  return join(
    setup.planRoot,
    `${(await targetDescription(setup)).label}-queue.md`,
  )
}

/** A later writer reuses the transcript's target and number, replacing its tag and kind. */
export function transcriptNameStart(transcript: string): string {
  const parsed = readPhaseFilename(basename(transcript))
  if (parsed?.kind !== "round" || parsed.extension !== "md")
    throw new Error(
      "Name a round's *-1-round.<tag>.md transcript at the plan checkout root.",
    )
  return parsed.nameStart
}

/** The runner's transcript title records the kind independently of its file name. */
export async function transcriptKind(transcript: string): Promise<RoundKind> {
  const title = (await readFile(transcript, "utf8")).split("\n", 1)[0]
  if (title.startsWith("# Plan audit of ")) return "planning"
  if (/^# (Implementation|Commit) audit of /.test(title))
    return "implementation"
  throw new Error(`Missing round kind in transcript title: ${transcript}`)
}

/** Read an existing phase document named without a path at the plan root. */
export async function roundDocument(
  context: ExecutionContext,
  file: string,
  kind: FileKind,
): Promise<{ path: string; nameStart: string }> {
  try {
    if (/[\\/]/.test(file)) throw new Error("Expected a bare file name")
    const path = await realpath(resolve(context.planRoot, file))
    const parsed = readPhaseFilename(basename(path))
    if (
      (await stat(path)).isFile() &&
      dirname(path) === context.planRoot &&
      parsed?.kind === kind &&
      parsed.extension === "md"
    )
      return { path, nameStart: parsed.nameStart }
  } catch {
    // Report the required document form below when the input cannot be opened.
  }
  throw new Error(
    `Name a round's *-${phaseOrder[kind]}-${kind}.<tag>.md ${kind === "round" ? "transcript" : "report"} by its bare file name at the plan checkout root: ${file}`,
  )
}

export type ManualPhase = "vet" | "rebut" | "fix"

/** The most recently modified document decides between eligible candidates. */
async function newestDocument(
  paths: readonly string[],
): Promise<string | undefined> {
  const dated = await Promise.all(
    paths.map(async (path) => ({ path, time: (await stat(path)).mtimeMs })),
  )
  return dated.sort((first, second) => second.time - first.time)[0]?.path
}

/** A brief given no transcript retells the most recent round at the plan root. */
export async function newestTranscript(
  context: ExecutionContext,
): Promise<string> {
  const newest = await newestDocument(
    (await phaseDocuments(context.planRoot, "round")).map(
      (document) => document.path,
    ),
  )
  if (newest === undefined)
    throw new Error(`No round transcript at ${context.planRoot}. Name one.`)
  return newest
}

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
  if (input === undefined) {
    const newest = await newestDocument(
      (await phaseDocuments(context.planRoot, "audit"))
        .filter((document) => {
          const sameAssistant = document.tag[0] === options.writer?.[0]
          if (phase === "vet") return !sameAssistant
          if (phase === "rebut") return sameAssistant
          return true
        })
        .map((document) => document.path),
    )
    if (newest === undefined)
      throw new Error(
        `No eligible audit report for ${phase} at ${context.planRoot}. Supply a file name.`,
      )
    input = basename(newest)
  }
  const source = await roundDocument(context, input, "audit")
  const root = dirname(source.path)
  const output = (kind: "vet" | "rebut") => {
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
    return newestDocument(
      (await phaseDocuments(root, kind))
        .filter((document) => document.nameStart === source.nameStart)
        .map((document) => document.path),
    )
  }
  if (phase === "vet") return [source.path, output(phase)]
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
