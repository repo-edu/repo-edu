import { existsSync, readFileSync, writeFileSync } from "node:fs"
import {
  MAX_CODER_EXPERIENCE,
  MAX_CODER_INTERACTION,
  MAX_COMMENTS,
  MAX_COMPLEXITY,
  MAX_STUDENTS,
  MIN_CODER_EXPERIENCE,
  MIN_CODER_INTERACTION,
  MIN_COMMENTS,
  MIN_COMPLEXITY,
  MIN_REVIEWS,
  MIN_STUDENTS,
  STYLES,
  type Style,
} from "./constants"
import type { Settings } from "./defaults"
import { fail } from "./log"

export interface BatchProjectSpec {
  complexity: number
  mp?: string
}

export interface BatchEntry {
  mp?: string
  mc?: string
  aiCoders?: boolean
  coderExperience?: number
  coderInteraction?: number
  students?: number
  rounds?: number
  reviews?: number
  comments?: number
  style?: Style
}

export interface BatchFile {
  project: string | BatchProjectSpec
  entries: BatchEntry[]
}

const ENTRY_KEYS = new Set<keyof BatchEntry>([
  "mp",
  "mc",
  "aiCoders",
  "coderExperience",
  "coderInteraction",
  "students",
  "rounds",
  "reviews",
  "comments",
  "style",
])

const PROJECT_KEYS = new Set<keyof BatchProjectSpec>(["complexity", "mp"])

function ensureInt(
  ref: string,
  v: unknown,
  min: number,
  max: number,
): number | undefined {
  if (v === undefined) return undefined
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    fail(`${ref}: must be integer ${min}-${max}, got ${JSON.stringify(v)}`)
  }
  return v
}

function ensureStr(ref: string, v: unknown): string | undefined {
  if (v === undefined) return undefined
  if (typeof v !== "string" || v.length === 0) {
    fail(`${ref}: must be a non-empty string, got ${JSON.stringify(v)}`)
  }
  return v
}

function ensureBool(ref: string, v: unknown): boolean | undefined {
  if (v === undefined) return undefined
  if (typeof v !== "boolean") {
    fail(`${ref}: must be a boolean, got ${JSON.stringify(v)}`)
  }
  return v
}

function ensureStyle(ref: string, v: unknown): Style | undefined {
  if (v === undefined) return undefined
  if (typeof v !== "string" || !STYLES.includes(v as Style)) {
    fail(
      `${ref}: must be one of ${STYLES.join(", ")}, got ${JSON.stringify(v)}`,
    )
  }
  return v as Style
}

function validateEntry(entry: unknown, idx: number): BatchEntry {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    fail(`entries[${idx}]: must be a JSON object`)
  }
  const obj = entry as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (!ENTRY_KEYS.has(key as keyof BatchEntry)) {
      fail(
        `entries[${idx}]: unknown key "${key}"; expected one of ${[...ENTRY_KEYS].join(", ")}`,
      )
    }
  }
  const ref = `entries[${idx}]`
  return {
    mp: ensureStr(`${ref}.mp`, obj.mp),
    mc: ensureStr(`${ref}.mc`, obj.mc),
    aiCoders: ensureBool(`${ref}.aiCoders`, obj.aiCoders),
    coderExperience: ensureInt(
      `${ref}.coderExperience`,
      obj.coderExperience,
      MIN_CODER_EXPERIENCE,
      MAX_CODER_EXPERIENCE,
    ),
    coderInteraction: ensureInt(
      `${ref}.coderInteraction`,
      obj.coderInteraction,
      MIN_CODER_INTERACTION,
      MAX_CODER_INTERACTION,
    ),
    students: ensureInt(
      `${ref}.students`,
      obj.students,
      MIN_STUDENTS,
      MAX_STUDENTS,
    ),
    rounds: ensureInt(`${ref}.rounds`, obj.rounds, 1, Number.MAX_SAFE_INTEGER),
    reviews: ensureInt(
      `${ref}.reviews`,
      obj.reviews,
      MIN_REVIEWS,
      Number.MAX_SAFE_INTEGER,
    ),
    comments: ensureInt(
      `${ref}.comments`,
      obj.comments,
      MIN_COMMENTS,
      MAX_COMMENTS,
    ),
    style: ensureStyle(`${ref}.style`, obj.style),
  }
}

function validateProject(raw: unknown): string | BatchProjectSpec {
  if (typeof raw === "string") return raw
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(
      `project: must be a string path or an object { complexity, mp? }, got ${JSON.stringify(raw)}`,
    )
  }
  const obj = raw as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (!PROJECT_KEYS.has(key as keyof BatchProjectSpec)) {
      fail(
        `project: unknown key "${key}"; expected one of ${[...PROJECT_KEYS].join(", ")}`,
      )
    }
  }
  const complexity = ensureInt(
    "project.complexity",
    obj.complexity,
    MIN_COMPLEXITY,
    MAX_COMPLEXITY,
  )
  if (complexity === undefined) {
    fail(`project.complexity: required when project is an object`)
  }
  return { complexity, mp: ensureStr("project.mp", obj.mp) }
}

export function loadBatch(path: string): BatchFile {
  if (!existsSync(path)) fail(`batch file not found: ${path}`)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, "utf8"))
  } catch (err) {
    fail(
      `${path}: invalid JSON (${err instanceof Error ? err.message : String(err)})`,
    )
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(`${path}: must be a JSON object with "project" and "entries"`)
  }
  const obj = raw as Record<string, unknown>
  if (!("project" in obj) || !("entries" in obj)) {
    fail(`${path}: must have "project" and "entries" top-level fields`)
  }
  if (!Array.isArray(obj.entries) || obj.entries.length === 0) {
    fail(`${path}: "entries" must be a non-empty array`)
  }
  const project = validateProject(obj.project)
  const entries = obj.entries.map((e, i) => validateEntry(e, i))
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (
      e.reviews !== undefined &&
      e.rounds !== undefined &&
      e.reviews > e.rounds
    ) {
      fail(
        `entries[${i}]: reviews (${e.reviews}) must be ≤ rounds (${e.rounds})`,
      )
    }
  }
  return { project, entries }
}

export function saveBatch(path: string, batch: BatchFile): void {
  writeFileSync(path, `${JSON.stringify(batch, null, 2)}\n`)
}

export function mergeEntry(prev: Settings, entry: BatchEntry): Settings {
  const next: Settings = { ...prev }
  if (entry.mp !== undefined) next.mp = entry.mp
  if (entry.mc !== undefined) next.mc = entry.mc
  if (entry.aiCoders !== undefined) next.aiCoders = entry.aiCoders
  if (entry.coderExperience !== undefined)
    next.coderExperience = entry.coderExperience
  if (entry.coderInteraction !== undefined)
    next.coderInteraction = entry.coderInteraction
  if (entry.students !== undefined) next.students = entry.students
  if (entry.rounds !== undefined) next.rounds = entry.rounds
  if (entry.reviews !== undefined) next.reviews = entry.reviews
  if (entry.comments !== undefined) next.comments = entry.comments
  if (entry.style !== undefined) next.style = entry.style
  if (next.reviews > next.rounds) {
    fail(`merged entry has reviews (${next.reviews}) > rounds (${next.rounds})`)
  }
  return next
}
