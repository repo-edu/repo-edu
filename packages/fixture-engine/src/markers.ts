import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { FixtureModelSpec } from "@repo-edu/integrations-llm-catalog"
import type {
  LlmAuthMode,
  LlmError,
  LlmProvider,
} from "@repo-edu/integrations-llm-contract"
import {
  QUOTA_EXHAUSTED_BASENAME,
  RATE_LIMITED_BASENAME,
  STATE_BASENAME,
} from "./constants"

export type CapMarkerKind = "rate_limit" | "quota_exhausted"

export interface CapMarker {
  kind: CapMarkerKind
  message: string
  timestamp: string
  spec: FixtureModelSpec
  provider: LlmProvider
  authMode: LlmAuthMode | null
  round: number
  coderTurn: number
}

export function isCapErrorKind(kind: LlmError["kind"]): kind is CapMarkerKind {
  return kind === "rate_limit" || kind === "quota_exhausted"
}

export function markerBasename(kind: CapMarkerKind): string {
  return kind === "rate_limit"
    ? RATE_LIMITED_BASENAME
    : QUOTA_EXHAUSTED_BASENAME
}

interface StateShape {
  rounds?: unknown[]
}

function completedRoundCount(repoDir: string): number {
  const path = resolve(repoDir, STATE_BASENAME)
  if (!existsSync(path)) return 0
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as StateShape
    return Array.isArray(raw.rounds) ? raw.rounds.length : 0
  } catch {
    return 0
  }
}

export function writeCapMarkerForRepo(
  repoDir: string,
  error: LlmError,
  spec: FixtureModelSpec,
): CapMarker | null {
  if (!isCapErrorKind(error.kind)) return null
  const completed = completedRoundCount(repoDir)
  const round = completed + 1
  const provider: LlmProvider = error.context.provider ?? spec.provider
  const authMode: LlmAuthMode | null = error.context.authMode ?? null
  const marker: CapMarker = {
    kind: error.kind,
    message: error.message,
    timestamp: new Date().toISOString(),
    spec,
    provider,
    authMode,
    round,
    coderTurn: round,
  }
  const path = resolve(repoDir, markerBasename(error.kind))
  writeFileSync(path, `${JSON.stringify(marker, null, 2)}\n`)
  return marker
}

export function readCapMarker(repoDir: string): CapMarker | null {
  for (const kind of ["rate_limit", "quota_exhausted"] as const) {
    const path = resolve(repoDir, markerBasename(kind))
    if (!existsSync(path)) continue
    try {
      return JSON.parse(readFileSync(path, "utf8")) as CapMarker
    } catch {
      return null
    }
  }
  return null
}

export function hasCapMarker(repoDir: string): boolean {
  return (
    existsSync(resolve(repoDir, RATE_LIMITED_BASENAME)) ||
    existsSync(resolve(repoDir, QUOTA_EXHAUSTED_BASENAME))
  )
}
