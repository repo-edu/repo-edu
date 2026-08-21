import { z } from "zod"

const threadRequestFields = {
  itemId: z.string().min(1),
  threadId: z.string().min(1),
  turnId: z.string().min(1),
}

export const commandExecutionApprovalParamsSchema = z
  .object({
    ...threadRequestFields,
    command: z.string().nullable().optional(),
    startedAtMs: z.number().int().nonnegative(),
  })
  .passthrough()

export const fileChangeApprovalParamsSchema = z
  .object({
    ...threadRequestFields,
    grantRoot: z.string().nullable().optional(),
    startedAtMs: z.number().int().nonnegative(),
  })
  .passthrough()

export const legacyCommandApprovalParamsSchema = z
  .object({
    callId: z.string().min(1),
    command: z.array(z.string()),
    conversationId: z.string().min(1),
    cwd: z.string(),
  })
  .passthrough()

const legacyFileChangeSchema = z
  .object({ type: z.enum(["add", "delete", "update"]) })
  .passthrough()

export const legacyPatchApprovalParamsSchema = z
  .object({
    callId: z.string().min(1),
    conversationId: z.string().min(1),
    fileChanges: z.record(z.string(), legacyFileChangeSchema),
  })
  .passthrough()

const permissionProfileSchema = z
  .object({
    fileSystem: z.unknown().nullable().optional(),
    network: z.unknown().nullable().optional(),
  })
  .strict()

export const permissionsApprovalParamsSchema = z
  .object({
    ...threadRequestFields,
    cwd: z.string(),
    permissions: permissionProfileSchema,
    startedAtMs: z.number().int().nonnegative(),
  })
  .passthrough()

const userInputQuestionSchema = z
  .object({
    header: z.string(),
    id: z.string().min(1),
    isOther: z.boolean().default(false),
    isSecret: z.boolean().default(false),
    options: z
      .array(
        z
          .object({
            description: z.string(),
            label: z.string(),
          })
          .strict(),
      )
      .nullable()
      .default(null),
    question: z.string(),
  })
  .passthrough()

export const toolRequestUserInputParamsSchema = z
  .object({
    ...threadRequestFields,
    isBlocking: z.boolean(),
    questions: z.array(userInputQuestionSchema),
  })
  .passthrough()
  .superRefine((params, context) => {
    const seen = new Set<string>()
    for (const [index, question] of params.questions.entries()) {
      if (seen.has(question.id)) {
        context.addIssue({
          code: "custom",
          message: "Human-review question IDs must be unique.",
          path: ["questions", index, "id"],
        })
      }
      seen.add(question.id)
    }
  })

export const serverRequestResolvedNotificationSchema = z
  .object({
    requestId: z.union([z.string(), z.number().int()]),
    threadId: z.string().min(1),
  })
  .passthrough()

export const chatgptTokenRefreshParamsSchema = z
  .object({ reason: z.literal("unauthorized") })
  .passthrough()

export type CodexAppServerPermissionProfile = z.infer<
  typeof permissionProfileSchema
>
