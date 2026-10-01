import type {
  AppError,
  CommandFailure,
  ExclusiveCommandId,
  Immutable,
} from "@repo-edu/application-contract"
import { gitProviderKinds, lmsProviderKinds } from "@repo-edu/domain/connection"
import type { RosterValidationKind } from "@repo-edu/domain/types"
import { z } from "zod"

export type Assert<T extends true> = T
// Wire copies are mutable; compare their immutable shapes in both directions
// so a schema cannot silently omit a contract variant or required field.
export type SchemaMatches<S extends z.core.SomeType, T> = [
  Immutable<z.output<S>>,
] extends [Immutable<T>]
  ? [Immutable<T>] extends [Immutable<z.output<S>>]
    ? true
    : false
  : false

type NotFoundResource = Extract<AppError, { type: "not-found" }>["resource"]
type ConflictResource = Extract<AppError, { type: "conflict" }>["resource"]
const resources: Record<NotFoundResource, true> = {
  connection: true,
  course: true,
  "group-set": true,
  assignment: true,
  repository: true,
  file: true,
}
const conflictResources: Record<ConflictResource, true> = {
  connection: true,
  "group-set": true,
  assignment: true,
  repository: true,
  file: true,
}
const resource = z.enum(Object.keys(resources) as NotFoundResource[])
const conflictResource = z.enum(
  Object.keys(conflictResources) as ConflictResource[],
)
const rosterValidationKinds: Record<RosterValidationKind, true> = {
  duplicate_student_id: true,
  missing_email: true,
  invalid_email: true,
  duplicate_email: true,
  duplicate_assignment_name: true,
  duplicate_group_id_in_assignment: true,
  duplicate_group_name_in_assignment: true,
  duplicate_repo_name_in_assignment: true,
  orphan_group_member: true,
  empty_group: true,
  system_group_sets_missing: true,
  invalid_enrollment_partition: true,
  invalid_group_origin: true,
  missing_git_username: true,
  invalid_git_username: true,
  unassigned_student: true,
  student_in_multiple_groups_in_assignment: true,
}
const failure = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("effect"), message: z.string() }),
  z.strictObject({
    type: z.literal("validation"),
    message: z.string(),
    issues: z.array(
      z.union([
        z.strictObject({ path: z.string(), message: z.string() }),
        z.strictObject({
          kind: z.enum(
            Object.keys(rosterValidationKinds) as RosterValidationKind[],
          ),
          affectedIds: z.array(z.string()),
          context: z.string().nullable(),
        }),
      ]),
    ),
  }),
  z.strictObject({
    type: z.literal("not-found"),
    message: z.string(),
    resource,
  }),
  z.strictObject({
    type: z.literal("conflict"),
    message: z.string(),
    resource: conflictResource,
    reason: z.string(),
  }),
  z.strictObject({
    type: z.literal("provider"),
    message: z.string(),
    provider: z.enum([...lmsProviderKinds, ...gitProviderKinds, "git", "llm"]),
    operation: z.string(),
    retryable: z.boolean(),
  }),
])

type _FailureContract = Assert<SchemaMatches<typeof failure, CommandFailure>>

export function commandSettlementSchema<
  K extends ExclusiveCommandId,
  R extends z.core.SomeType,
  A extends z.core.SomeType,
>(command: K, result: R, authoritative: A) {
  return z
    .strictObject({
      workflowId: z.literal(command),
      outcome: z.discriminatedUnion("disposition", [
        z.strictObject({
          disposition: z.literal("stopped"),
          result,
        }),
        z.strictObject({
          disposition: z.literal("completed"),
          completion: z.discriminatedUnion("status", [
            z.strictObject({ status: z.literal("succeeded"), result }),
            z.strictObject({
              status: z.literal("failed"),
              error: failure,
              result,
            }),
          ]),
        }),
      ]),
      authoritative,
    })
    .or(
      z.strictObject({
        workflowId: z.literal(command),
        outcome: z.discriminatedUnion("disposition", [
          z.strictObject({
            disposition: z.literal("refused"),
            error: failure,
          }),
          z.strictObject({
            disposition: z.literal("stopped"),
            result: z.null(),
          }),
          z.strictObject({
            disposition: z.literal("completed"),
            completion: z.strictObject({
              status: z.literal("failed"),
              error: failure,
              result: z.null(),
            }),
          }),
          z.strictObject({
            disposition: z.literal("uncertain"),
            reason: z.literal("confirmation-expired"),
            message: z.string(),
          }),
        ]),
        authoritative: z.undefined(),
      }),
    )
}
