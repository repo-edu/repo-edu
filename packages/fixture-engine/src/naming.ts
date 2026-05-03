import { existsSync } from "node:fs"
import { resolve } from "node:path"
import {
  archivalModelCode,
  type FixtureModelSpec,
} from "@repo-edu/integrations-llm-catalog"
import { STYLE_CODE, type Style } from "./constants"

export interface PlanNameOpts {
  plannerSpec: FixtureModelSpec
  aiCoders: boolean
  complexity: number
  students: number
  rounds: number
  reviews: number
  coderInteraction: number
  style: Style
}

export interface RepoNameOpts {
  coderSpec: FixtureModelSpec
  comments: number
}

export function planPostfix(opts: PlanNameOpts): string {
  const parts: string[] = []
  if (opts.aiCoders) parts.push("ai")
  parts.push(
    `i${opts.coderInteraction}`,
    STYLE_CODE[opts.style],
    `s${opts.students}`,
    `r${opts.rounds}`,
    `w${opts.reviews}`,
  )
  return parts.join("-")
}

export function repoPostfix(opts: RepoNameOpts): string {
  return `m${archivalModelCode(opts.coderSpec)}-o${opts.comments}`
}

export function nextAvailable(dir: string, base: string, ext = ""): string {
  if (!existsSync(resolve(dir, `${base}${ext}`))) return `${base}${ext}`
  let n = 2
  while (existsSync(resolve(dir, `${base}-v${n}${ext}`))) n++
  return `${base}-v${n}${ext}`
}
