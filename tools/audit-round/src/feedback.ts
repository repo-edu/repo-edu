import { z } from "zod"
import type {
  AssistantTurnInput,
  PhaseControlResult,
  SessionContext,
} from "./phase.js"
import type { ModelTokenUsage } from "./round-data.js"

export const selectionSchema = z.object({
  model: z.string().min(1),
  effort: z.string().min(1).nullable(),
})
export type ModelSelection = z.infer<typeof selectionSchema>

/**
 * The release each model name the settings may pin resolves to, as the CLI
 * answered at startup. A name the CLI was not asked about runs as written.
 */
export type ModelReleases = ReadonlyMap<string, string>

export type Feedback =
  | { readonly type: "session"; readonly sessionId: string }
  | { readonly type: "model"; readonly selection: ModelSelection }
  | ({ readonly type: "context" } & SessionContext)
  | { readonly type: "compaction" }
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "diagnostic"; readonly text: string }
  | {
      readonly type: "tokens"
      /** Both CLIs report the session's latest running total. */
      readonly update:
        | {
            readonly kind: "models"
            readonly models: readonly ModelTokenUsage[]
          }
        | {
            readonly kind: "selected-model"
            readonly tokens: Omit<ModelTokenUsage, "model">
          }
    }
  | {
      readonly type: "tool"
      /** Present once per invocation, including completed file changes. */
      readonly invocation: string | null
      readonly detail: unknown
      readonly stage: "started" | "completed"
    }

/**
 * Turn evidence stays with the invocation, outside display state. `final` is
 * a turn's text and `complete` marks a finished turn; a session may hold
 * several, and the invocation reads the last turn's text as the phase result.
 */
export type AssistantEvent =
  | Feedback
  | { readonly type: "final"; readonly text: string }
  | { readonly type: "complete" }

/**
 * Where an invocation's output goes. Starting one opens its own recorder, so
 * vets of one panel that run at the same time never share a record: each
 * event reaches the recorder of the invocation that produced it.
 */
export type PhaseOutput = {
  readonly start: (
    input: AssistantTurnInput,
    prompt: string,
  ) => Promise<PhaseRecorder>
}

/**
 * The same output with one more step after each event a started invocation
 * records, for a caller that checks what the assistant reports.
 */
export function observedOutput(
  output: PhaseOutput,
  after: (feedback: Feedback) => Promise<void> | void,
): PhaseOutput {
  return {
    start: async (input, prompt) => {
      const recorder = await output.start(input, prompt)
      return {
        ...recorder,
        observe: async (feedback) => {
          await recorder.observe(feedback)
          await after(feedback)
        },
      }
    },
  }
}

/** One started invocation's events and ending. */
export type PhaseRecorder = {
  readonly observe: (feedback: Feedback) => Promise<void>
  readonly finish: (result: PhaseControlResult) => Promise<PhaseCompletion>
  /**
   * Ends the invocation's live output even after a required write fails. An
   * invocation that never finished keeps the time and tokens it spent.
   */
  readonly release: () => void
}

/** Measurements owned by the output recorder once one invocation settles. */
export type PhaseCompletion = {
  readonly compactions: number
}

export const eventSchema = z.looseObject({ type: z.string().min(1) })
export const tokenSchema = z.number().int().nonnegative()

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
