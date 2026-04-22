import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { STUDENT_REPOS } from "./constants"

export const FIXTURE_STATE_FILE = resolve(STUDENT_REPOS, ".fixture-state.json")

export interface FixtureState {
  project: string | null
  plan: string | null
}

const EMPTY: FixtureState = { project: null, plan: null }

export function readState(): FixtureState {
  if (!existsSync(FIXTURE_STATE_FILE)) return EMPTY
  try {
    const raw = JSON.parse(readFileSync(FIXTURE_STATE_FILE, "utf8"))
    return {
      project: typeof raw.project === "string" ? raw.project : null,
      plan: typeof raw.plan === "string" ? raw.plan : null,
    }
  } catch {
    return EMPTY
  }
}

export function writeState(state: FixtureState): void {
  writeFileSync(FIXTURE_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`)
}
