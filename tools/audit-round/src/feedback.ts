import { z } from "zod"
import type { PhaseInput, PhaseResult } from "./phase.js"

export const selectionSchema = z.object({
  model: z.string().min(1),
  effort: z.string().min(1).nullable(),
})
export type ModelSelection = z.infer<typeof selectionSchema>

export type Feedback =
  | { readonly type: "session"; readonly sessionId: string }
  | { readonly type: "model"; readonly selection: ModelSelection }
  | {
      readonly type: "context"
      readonly tokens: number
      readonly window: number | null
    }
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "diagnostic"; readonly text: string }
  | {
      readonly type: "tool"
      readonly name: string
      readonly detail: unknown
      readonly command?: string
      readonly stage: "started" | "completed"
    }

/** Completion evidence stays with the invocation, outside display state. */
export type AssistantEvent =
  | Feedback
  | { readonly type: "final"; readonly text: string }
  | { readonly type: "complete" }

export type PhaseOutput = {
  readonly start: (input: PhaseInput, prompt: string) => Promise<void>
  readonly observe: (feedback: Feedback) => Promise<void>
  readonly finish: (result: PhaseResult) => Promise<void>
  /** Releases transient terminal output even after a required write fails. */
  readonly release: () => void
}

export const eventSchema = z.looseObject({ type: z.string().min(1) })
export const tokenSchema = z.number().int().nonnegative()

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
