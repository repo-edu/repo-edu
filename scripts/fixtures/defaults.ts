import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  DEFAULT_AI_CODERS,
  DEFAULT_CODER_EXPERIENCE,
  DEFAULT_CODER_INTERACTION,
  DEFAULT_COMMENTS,
  DEFAULT_COMPLEXITY,
  DEFAULT_MC,
  DEFAULT_MP,
  DEFAULT_REVIEW_FREQUENCY,
  DEFAULT_ROUNDS,
  DEFAULT_STUDENTS,
  MAX_CODER_EXPERIENCE,
  MAX_CODER_INTERACTION,
  MAX_COMMENTS,
  MAX_COMPLEXITY,
  MAX_REVIEW_FREQUENCY,
  MAX_STUDENTS,
  MIN_CODER_EXPERIENCE,
  MIN_CODER_INTERACTION,
  MIN_COMMENTS,
  MIN_COMPLEXITY,
  MIN_REVIEW_FREQUENCY,
  MIN_STUDENTS,
  SETTINGS_BASENAME,
  STUDENT_REPOS,
} from "./constants"
import { fail } from "./log"

export const FIXTURE_SETTINGS_FILE = resolve(STUDENT_REPOS, SETTINGS_BASENAME)

export interface Settings {
  mp: string
  mc: string
  aiCoders: boolean
  coderExperience: number
  coderInteraction: number
  complexity: number
  students: number
  rounds: number
  comments: number
  reviewFrequency: number
}

export const HARDCODED_SETTINGS: Settings = {
  mp: DEFAULT_MP,
  mc: DEFAULT_MC,
  aiCoders: DEFAULT_AI_CODERS,
  coderExperience: DEFAULT_CODER_EXPERIENCE,
  coderInteraction: DEFAULT_CODER_INTERACTION,
  complexity: DEFAULT_COMPLEXITY,
  students: DEFAULT_STUDENTS,
  rounds: DEFAULT_ROUNDS,
  comments: DEFAULT_COMMENTS,
  reviewFrequency: DEFAULT_REVIEW_FREQUENCY,
}

interface Spec {
  min: number
  max: number
}

const NUMERIC_SPECS: Record<
  keyof Omit<Settings, "mp" | "mc" | "aiCoders">,
  Spec
> = {
  coderExperience: { min: MIN_CODER_EXPERIENCE, max: MAX_CODER_EXPERIENCE },
  coderInteraction: { min: MIN_CODER_INTERACTION, max: MAX_CODER_INTERACTION },
  complexity: { min: MIN_COMPLEXITY, max: MAX_COMPLEXITY },
  students: { min: MIN_STUDENTS, max: MAX_STUDENTS },
  rounds: { min: 1, max: Number.MAX_SAFE_INTEGER },
  comments: { min: MIN_COMMENTS, max: MAX_COMMENTS },
  reviewFrequency: { min: MIN_REVIEW_FREQUENCY, max: MAX_REVIEW_FREQUENCY },
}

const KNOWN_KEYS = new Set<keyof Settings>([
  "mp",
  "mc",
  "aiCoders",
  ...(Object.keys(NUMERIC_SPECS) as (keyof Settings)[]),
])

function parseSettingsFile(path: string): Partial<Settings> {
  if (!existsSync(path)) return {}
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, "utf8"))
  } catch (err) {
    fail(
      `${path}: invalid JSON (${err instanceof Error ? err.message : String(err)})`,
    )
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(`${path}: must be a JSON object`)
  }
  const obj = raw as Record<string, unknown>
  const out: Partial<Settings> = {}

  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key as keyof Settings)) {
      fail(
        `${path}: unknown key "${key}"; expected one of ${[...KNOWN_KEYS].join(", ")}`,
      )
    }
  }

  for (const [key, spec] of Object.entries(NUMERIC_SPECS) as [
    keyof typeof NUMERIC_SPECS,
    Spec,
  ][]) {
    const v = obj[key]
    if (v === undefined) continue
    if (
      typeof v !== "number" ||
      !Number.isInteger(v) ||
      v < spec.min ||
      v > spec.max
    ) {
      fail(
        `${path}: "${key}" must be an integer ${spec.min}-${spec.max}, got ${JSON.stringify(v)}`,
      )
    }
    out[key] = v
  }
  for (const key of ["mp", "mc"] as const) {
    const v = obj[key]
    if (v === undefined) continue
    if (typeof v !== "string" || v.length === 0) {
      fail(
        `${path}: "${key}" must be a non-empty model-code string, got ${JSON.stringify(v)}`,
      )
    }
    out[key] = v
  }
  if (obj.aiCoders !== undefined) {
    if (typeof obj.aiCoders !== "boolean") {
      fail(
        `${path}: "aiCoders" must be a boolean, got ${JSON.stringify(obj.aiCoders)}`,
      )
    }
    out.aiCoders = obj.aiCoders
  }

  return out
}

export const SETTINGS: Settings = {
  ...HARDCODED_SETTINGS,
  ...parseSettingsFile(FIXTURE_SETTINGS_FILE),
}

export function writeSettings(dir: string, settings: Settings): void {
  writeFileSync(
    resolve(dir, SETTINGS_BASENAME),
    `${JSON.stringify(settings, null, 2)}\n`,
  )
}

export function readSettings(dir: string): Settings {
  return {
    ...HARDCODED_SETTINGS,
    ...parseSettingsFile(resolve(dir, SETTINGS_BASENAME)),
  }
}
