import type { PersistedCourse } from "@repo-edu/domain/types"
import type { AppError } from "./app-error.js"
import type { CourseStorageFailure } from "./course-storage.js"
import type {
  CourseChangingCommandId,
  ExclusiveAuthoritativeValues,
  ExclusiveCommandId,
  ExclusiveCommandInput,
  ExclusiveCommandResult,
  Immutable,
} from "./exclusive-command-contract.js"

/** Store failures never become a healthy command settlement, even before a write. */
export type TerminalStoreFailure =
  | CourseStorageFailure
  | { type: "settings-storage"; message: string }
  | { type: "examination-archive-storage"; message: string }

/** A description cannot prove a disposition. Only the effect owner may do that. */
export type CommandFailure =
  | Immutable<
      Extract<
        AppError,
        {
          type: "validation" | "not-found" | "conflict" | "provider"
        }
      >
    >
  | { readonly type: "effect"; readonly message: string }

export type KnownCommandCompletion<T> =
  | { readonly status: "succeeded"; readonly result: T }
  | {
      readonly status: "failed"
      readonly error: CommandFailure
      readonly result: T | null
    }

/** A null result proves that there is no result to apply, not that work never began. */
export type EffectOutcome<T> =
  | { readonly disposition: "refused"; readonly error: CommandFailure }
  | { readonly disposition: "stopped"; readonly result: T | null }
  | {
      readonly disposition: "completed"
      readonly completion: KnownCommandCompletion<T>
    }
  | {
      readonly disposition: "uncertain"
      readonly reason: "confirmation-expired" | "proof-lost"
      readonly message: string
    }

/** An effect owner supplies this proof before application error normalisation.
 * Unknown errors without this proof remain terminal at the desktop boundary. */
export class CommandOutcomeError extends Error {
  override readonly name = "CommandOutcomeError"

  constructor(readonly outcome: EffectOutcome<never>) {
    super(
      outcome.disposition === "uncertain"
        ? outcome.message
        : outcome.disposition === "refused"
          ? outcome.error.message
          : outcome.disposition === "stopped"
            ? "Operation cancelled."
            : outcome.completion.status === "failed"
              ? outcome.completion.error.message
              : "Operation completed.",
    )
  }
}

export type SettledEffectOutcome<T> = Exclude<
  EffectOutcome<T>,
  { disposition: "uncertain" }
>

export type ExclusiveCommandOutcome<K extends ExclusiveCommandId> =
  EffectOutcome<ExclusiveCommandResult<K>>

export type ExclusiveTerminalSettlement<
  K extends ExclusiveCommandId = ExclusiveCommandId,
> = {
  [Id in K]:
    | {
        readonly workflowId: Id
        readonly outcome: SettledEffectOutcome<ExclusiveCommandResult<Id>>
        readonly authoritative: ExclusiveAuthoritativeValues<Id>
      }
    | {
        readonly workflowId: Id
        readonly outcome:
          | { readonly disposition: "refused"; readonly error: CommandFailure }
          | { readonly disposition: "stopped"; readonly result: null }
          | {
              readonly disposition: "completed"
              readonly completion: {
                readonly status: "failed"
                readonly error: CommandFailure
                readonly result: null
              }
            }
          | {
              readonly disposition: "uncertain"
              readonly reason: "confirmation-expired"
              readonly message: string
            }
        readonly authoritative: undefined
      }
}[K]

/** One owner composes this value; durable save and renderer application share it. */
export type CourseCommandTransition<K extends CourseChangingCommandId> = (
  input: ExclusiveCommandInput<K>,
  outcome: SettledEffectOutcome<ExclusiveCommandResult<K>>,
) => Immutable<PersistedCourse>

export type ExclusiveCancellationStage = "preparing" | "running" | "settling"
export type ExclusiveCancellationAction =
  | "prevent-effect"
  | "forward-once"
  | "ignore"

export const exclusiveCancellationActions = {
  preparing: "prevent-effect",
  running: "forward-once",
  settling: "ignore",
} as const satisfies Record<
  ExclusiveCancellationStage,
  ExclusiveCancellationAction
>

/** Accepted persistence completes even when cancellation prevents the effect. */
export type ExclusiveCancellation = { readonly type: "cancel" }
