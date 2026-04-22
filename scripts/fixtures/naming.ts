import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import { EFFORT_DIGIT, MODEL_DIGIT, type ModelName } from "./constants"

export interface PlanNameOpts {
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
  complexity: number
  students: number
  rounds: number
  interaction: number
}

export interface RepoNameOpts extends PlanNameOpts {
  coderModel: ModelName
  coderEffort: EffortLevel | "none"
  coderLevel: number
}

export function modelCode(
  model: ModelName,
  effort: EffortLevel | "none",
): string {
  const m = MODEL_DIGIT[model]
  if (model === "haiku") return String(m)
  return `${m}${EFFORT_DIGIT[effort]}`
}

export function formatSpec(
  model: ModelName,
  effort: EffortLevel | "none",
): string {
  return effort === "none" ? model : `${model}-${effort}`
}

export function parseSpec(spec: string): {
  model: ModelName
  effort: EffortLevel | "none"
} {
  const dash = spec.indexOf("-")
  if (dash < 0) return { model: spec as ModelName, effort: "none" }
  return {
    model: spec.slice(0, dash) as ModelName,
    effort: spec.slice(dash + 1) as EffortLevel,
  }
}

export function planPostfix(opts: PlanNameOpts): string {
  const parts = [
    `mp${modelCode(opts.plannerModel, opts.plannerEffort)}`,
    `c${opts.complexity}`,
    `s${opts.students}`,
    `r${opts.rounds}`,
    `i${opts.interaction}`,
  ]
  return parts.join("-")
}

export function repoPostfix(opts: RepoNameOpts): string {
  const parts = [
    `mp${modelCode(opts.plannerModel, opts.plannerEffort)}`,
    `mc${modelCode(opts.coderModel, opts.coderEffort)}`,
    `l${opts.coderLevel}`,
    `c${opts.complexity}`,
    `s${opts.students}`,
    `r${opts.rounds}`,
    `i${opts.interaction}`,
  ]
  return parts.join("-")
}

export function nextAvailable(dir: string, base: string, ext = ""): string {
  if (!existsSync(resolve(dir, `${base}${ext}`))) return `${base}${ext}`
  let n = 2
  while (existsSync(resolve(dir, `${base}-v${n}${ext}`))) n++
  return `${base}-v${n}${ext}`
}
