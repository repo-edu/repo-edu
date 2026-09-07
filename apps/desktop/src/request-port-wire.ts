import {
  exclusiveCommandDeclarations,
  workflowInputSchemas,
} from "@repo-edu/application-contract"
import { persistedCourseSchema } from "@repo-edu/domain/schemas"
import { z } from "zod"

export const requestPortChannel = "repo-edu/request-port"
export const closeTransferSchema = z.strictObject({ kind: z.literal("close") })
export const exclusiveCommandIdSchema = z.enum(
  Object.keys(exclusiveCommandDeclarations) as [
    keyof typeof exclusiveCommandDeclarations,
    ...Array<keyof typeof exclusiveCommandDeclarations>,
  ],
)
export const commandIntentSchema = z.strictObject({
  kind: z.literal("command-intent"),
  workflowId: exclusiveCommandIdSchema,
})

export const persistenceBundleSchema = z.strictObject({
  course: workflowInputSchemas["course.save"].optional(),
  credentials: workflowInputSchemas["settings.saveCredentials"].optional(),
  preferences: workflowInputSchemas["settings.savePreferences"].optional(),
})
export const persistenceResultSchema = z.strictObject({
  course: z
    .strictObject({
      courseId: z.string(),
      revision: persistedCourseSchema.shape.revision,
      updatedAt: persistedCourseSchema.shape.updatedAt,
    })
    .optional(),
})
export type RequestPersistenceBundle = z.infer<typeof persistenceBundleSchema>
export type RequestPersistenceResult = z.infer<typeof persistenceResultSchema>

/** Payload schemas belong to the command declaration supplied to both endpoints. */
export type RequestPayloadSchemas<Input, Progress, Output, Settlement> = {
  input: z.ZodType<Input>
  progress: z.ZodType<Progress>
  output: z.ZodType<Output>
  settlement: z.ZodType<Settlement>
}

export function requestMessageSchemas<I, P, O, S>(
  payloads: RequestPayloadSchemas<I, P, O, S>,
) {
  return {
    admission: z.strictObject({
      type: z.literal("admission"),
      status: z.enum(["accepted", "busy"]),
    }),
    prepare: z.strictObject({ type: z.literal("prepare") }),
    bundle: z.strictObject({
      type: z.literal("bundle"),
      bundle: persistenceBundleSchema,
    }),
    persisted: z.strictObject({
      type: z.literal("persisted"),
      result: persistenceResultSchema,
    }),
    input: z.strictObject({ type: z.literal("input"), input: payloads.input }),
    progress: z.strictObject({
      type: z.literal("progress"),
      progress: payloads.progress,
    }),
    output: z.strictObject({
      type: z.literal("output"),
      output: payloads.output,
    }),
    cancel: z.strictObject({ type: z.literal("cancel") }),
    settlement: z.strictObject({
      type: z.literal("settlement"),
      settlement: payloads.settlement,
    }),
    acknowledged: z.strictObject({ type: z.literal("acknowledged") }),
    released: z.strictObject({ type: z.literal("released") }),
    "close-ready": z.strictObject({ type: z.literal("close-ready") }),
    "close-acknowledged": z.strictObject({
      type: z.literal("close-acknowledged"),
    }),
  }
}

export type RequestMessage<I, P, O, S> =
  | { type: "admission"; status: "accepted" | "busy" }
  | { type: "prepare" }
  | { type: "bundle"; bundle: RequestPersistenceBundle }
  | { type: "persisted"; result: RequestPersistenceResult }
  | { type: "input"; input: I }
  | { type: "progress"; progress: P }
  | { type: "output"; output: O }
  | { type: "cancel" }
  | { type: "settlement"; settlement: S }
  | { type: "acknowledged" }
  | { type: "released" }
  | { type: "close-ready" }
  | { type: "close-acknowledged" }

export const closePayloadSchemas = {
  input: z.never(),
  progress: z.never(),
  output: z.never(),
  settlement: z.never(),
}
