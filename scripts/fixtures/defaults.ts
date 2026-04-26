import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  COMMENTS_FREE_TIER,
  DEFAULT_AI_CODERS,
  DEFAULT_CODER_EXPERIENCE,
  DEFAULT_CODER_INTERACTION,
  DEFAULT_COMMENTS,
  DEFAULT_COMPLEXITY,
  DEFAULT_MC,
  DEFAULT_MP,
  DEFAULT_REVIEWS,
  DEFAULT_ROUNDS,
  DEFAULT_STUDENTS,
  DEFAULT_STYLE,
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
  SETTINGS_BASENAME,
  STUDENT_REPOS,
  STYLES,
  type Style,
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
  reviews: number
  style: Style
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
  reviews: DEFAULT_REVIEWS,
  style: DEFAULT_STYLE,
}

interface Spec {
  min: number
  max: number
}

const NUMERIC_SPECS: Record<
  keyof Omit<Settings, "mp" | "mc" | "aiCoders" | "style">,
  Spec
> = {
  coderExperience: { min: MIN_CODER_EXPERIENCE, max: MAX_CODER_EXPERIENCE },
  coderInteraction: { min: MIN_CODER_INTERACTION, max: MAX_CODER_INTERACTION },
  complexity: { min: MIN_COMPLEXITY, max: MAX_COMPLEXITY },
  students: { min: MIN_STUDENTS, max: MAX_STUDENTS },
  rounds: { min: 1, max: Number.MAX_SAFE_INTEGER },
  comments: { min: MIN_COMMENTS, max: MAX_COMMENTS },
  reviews: { min: MIN_REVIEWS, max: Number.MAX_SAFE_INTEGER },
}

const KNOWN_KEYS = new Set<keyof Settings>([
  "mp",
  "mc",
  "aiCoders",
  "style",
  ...(Object.keys(NUMERIC_SPECS) as (keyof Settings)[]),
])

function stripJsoncComments(text: string): string {
  let out = ""
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      out += c
      i++
      while (i < text.length) {
        const ch = text[i]
        out += ch
        if (ch === "\\" && i + 1 < text.length) {
          out += text[i + 1]
          i += 2
          continue
        }
        i++
        if (ch === '"') break
      }
      continue
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++
      continue
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}

function parseJsonc(text: string): unknown {
  const stripped = stripJsoncComments(text).replace(/,(\s*[\]}])/g, "$1")
  return JSON.parse(stripped)
}

function parseSettingsFile(path: string): Partial<Settings> {
  if (!existsSync(path)) return {}
  let raw: unknown
  try {
    raw = parseJsonc(readFileSync(path, "utf8"))
  } catch (err) {
    fail(
      `${path}: invalid JSONC (${err instanceof Error ? err.message : String(err)})`,
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
  if (obj.style !== undefined) {
    if (typeof obj.style !== "string" || !STYLES.includes(obj.style as Style)) {
      fail(
        `${path}: "style" must be one of ${STYLES.join(", ")}, got ${JSON.stringify(obj.style)}`,
      )
    }
    out.style = obj.style as Style
  }

  return out
}

export const SETTINGS: Settings = {
  ...HARDCODED_SETTINGS,
  ...parseSettingsFile(FIXTURE_SETTINGS_FILE),
}

export const SETTINGS_COMMENT_COL = 28

type SettingItem =
  | {
      kind: "row"
      key: keyof Settings
      value: (s: Settings) => string
      comment: string
      cont?: string
    }
  | { kind: "header"; text: string }

const SETTING_ITEMS: SettingItem[] = [
  {
    kind: "row",
    key: "mp",
    value: (s) => `"${s.mp}"`,
    comment: "project and planner model CODE",
  },
  {
    kind: "row",
    key: "mc",
    value: (s) => `"${s.mc}"`,
    comment: "coder model CODE",
  },
  { kind: "header", text: "fixture project" },
  {
    kind: "row",
    key: "complexity",
    value: (s) => String(s.complexity),
    comment: `integer ${MIN_COMPLEXITY}-${MAX_COMPLEXITY}, project tier`,
  },
  { kind: "header", text: "fixture plan" },
  {
    kind: "row",
    key: "aiCoders",
    value: (s) => String(s.aiCoders),
    comment: "AI-coders mode vs student framing",
  },
  {
    kind: "row",
    key: "coderInteraction",
    value: (s) => String(s.coderInteraction),
    comment: `integer ${MIN_CODER_INTERACTION}-${MAX_CODER_INTERACTION}, cross-module author mixing`,
  },
  {
    kind: "row",
    key: "style",
    value: (s) => `"${s.style}"`,
    comment: `one of: ${STYLES.slice(0, 3).join(" | ")} |`,
    cont: `        ${STYLES.slice(3).join(" | ")}`,
  },
  {
    kind: "row",
    key: "students",
    value: (s) => String(s.students),
    comment: `integer ${MIN_STUDENTS}-${MAX_STUDENTS}, team size`,
  },
  {
    kind: "row",
    key: "rounds",
    value: (s) => String(s.rounds),
    comment: "integer ≥1, build-commit count",
  },
  {
    kind: "row",
    key: "reviews",
    value: (s) => String(s.reviews),
    comment: `integer ${MIN_REVIEWS}..rounds, review-commit count`,
  },
  { kind: "header", text: "fixture repo" },
  {
    kind: "row",
    key: "coderExperience",
    value: (s) => String(s.coderExperience),
    comment: `integer ${MIN_CODER_EXPERIENCE}-${MAX_CODER_EXPERIENCE}, ignored when aiCoders=true`,
  },
  {
    kind: "row",
    key: "comments",
    value: (s) => String(s.comments),
    comment: `integer ${MIN_COMMENTS}-${MAX_COMMENTS}, ${COMMENTS_FREE_TIER}=leave to coder`,
  },
]

function row(prefix: string, comment: string): string {
  const pad = Math.max(2, SETTINGS_COMMENT_COL - prefix.length)
  return `${prefix}${" ".repeat(pad)}// ${comment}`
}

function continuation(comment: string): string {
  return `${" ".repeat(SETTINGS_COMMENT_COL)}// ${comment}`
}

export function settingsRowsForHelp(s: Settings): string[] {
  const lastRowIdx = SETTING_ITEMS.reduce(
    (acc, item, i) => (item.kind === "row" ? i : acc),
    -1,
  )
  const lines: string[] = []
  for (let i = 0; i < SETTING_ITEMS.length; i++) {
    const item = SETTING_ITEMS[i]
    if (item.kind === "header") {
      lines.push("")
      lines.push(`    // ${item.text}`)
      continue
    }
    const isLast = i === lastRowIdx
    const prefix = `    "${item.key}": ${item.value(s)}${isLast ? "" : ","}`
    lines.push(row(prefix, item.comment))
    if (item.cont) lines.push(continuation(item.cont))
  }
  return lines
}

export const SETTINGS_PREAMBLE = [
  "Holds the resolved values from the most recent run; supplies CLI",
  "defaults for the next run (CLI flags override file values). A frozen",
  "copy is also written into each plan folder. All keys optional;",
  "unknown keys or out-of-range values fail fast.",
]

export function settingsToJsonc(s: Settings): string {
  const lines = SETTINGS_PREAMBLE.map((l) => `// ${l}`)
  lines.push("", "{", ...settingsRowsForHelp(s), "}", "")
  return lines.join("\n")
}

export function writeSettings(dir: string, settings: Settings): void {
  writeFileSync(resolve(dir, SETTINGS_BASENAME), settingsToJsonc(settings))
}

export function readSettings(dir: string): Settings {
  return {
    ...HARDCODED_SETTINGS,
    ...parseSettingsFile(resolve(dir, SETTINGS_BASENAME)),
  }
}
