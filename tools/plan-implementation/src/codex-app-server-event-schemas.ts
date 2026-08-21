import { z } from "zod"

const itemStatusSchema = z.enum([
  "inProgress",
  "completed",
  "failed",
  "declined",
])

const reasoningItemSchema = z
  .object({
    id: z.string().min(1),
    summary: z.array(z.string()).default([]),
    type: z.literal("reasoning"),
  })
  .passthrough()

const commandItemSchema = z
  .object({
    aggregatedOutput: z.string().nullable().optional(),
    command: z.string(),
    exitCode: z.number().int().nullable().optional(),
    id: z.string().min(1),
    status: itemStatusSchema,
    type: z.literal("commandExecution"),
  })
  .passthrough()

const patchChangeKindSchema = z
  .object({ type: z.enum(["add", "delete", "update"]) })
  .passthrough()

const fileChangeItemSchema = z
  .object({
    changes: z.array(
      z
        .object({
          kind: patchChangeKindSchema,
          path: z.string(),
        })
        .passthrough(),
    ),
    id: z.string().min(1),
    status: itemStatusSchema,
    type: z.literal("fileChange"),
  })
  .passthrough()

const mcpToolCallItemSchema = z
  .object({
    id: z.string().min(1),
    server: z.string(),
    status: z.enum(["inProgress", "completed", "failed"]),
    tool: z.string(),
    type: z.literal("mcpToolCall"),
  })
  .passthrough()

const webSearchItemSchema = z
  .object({
    id: z.string().min(1),
    query: z.string(),
    type: z.literal("webSearch"),
  })
  .passthrough()

const contextCompactionItemSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("contextCompaction"),
  })
  .passthrough()

const consumedItemTypes = new Set([
  "reasoning",
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "webSearch",
  "contextCompaction",
])

const otherItemSchema = z
  .object({
    type: z
      .string()
      .min(1)
      .refine((type) => !consumedItemTypes.has(type)),
  })
  .passthrough()
  .transform(() => ({ type: "other" as const }))

const consumedItemSchema = z.union([
  reasoningItemSchema,
  commandItemSchema,
  fileChangeItemSchema,
  mcpToolCallItemSchema,
  webSearchItemSchema,
  contextCompactionItemSchema,
  otherItemSchema,
])

export const codexAppServerItemLifecycleNotificationSchema = z
  .object({
    item: consumedItemSchema,
    threadId: z.string().min(1),
    turnId: z.string().min(1),
  })
  .passthrough()

export const codexAppServerTurnPlanUpdatedNotificationSchema = z
  .object({
    plan: z.array(
      z
        .object({
          status: z.enum(["pending", "inProgress", "completed"]),
          step: z.string(),
        })
        .passthrough(),
    ),
    threadId: z.string().min(1),
    turnId: z.string().min(1),
  })
  .passthrough()

const tokenUsageBreakdownSchema = z
  .object({
    cacheWriteInputTokens: z.number().int().nonnegative().default(0),
    cachedInputTokens: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningOutputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .passthrough()

export const codexAppServerTokenUsageUpdatedNotificationSchema = z
  .object({
    threadId: z.string().min(1),
    tokenUsage: z
      .object({
        last: tokenUsageBreakdownSchema,
        modelContextWindow: z.number().int().positive().nullable().optional(),
        total: tokenUsageBreakdownSchema,
      })
      .passthrough(),
    turnId: z.string().min(1),
  })
  .passthrough()

export const codexAppServerErrorNotificationSchema = z
  .object({
    error: z.object({ message: z.string() }).passthrough(),
    threadId: z.string().min(1),
    turnId: z.string().min(1),
    willRetry: z.boolean(),
  })
  .passthrough()

export const codexAppServerWarningNotificationSchema = z
  .object({
    message: z.string(),
    threadId: z.string().min(1).nullable().optional(),
  })
  .passthrough()

export const codexAppServerGuardianWarningNotificationSchema = z
  .object({
    message: z.string(),
    threadId: z.string().min(1),
  })
  .passthrough()

const approvalReviewStatusSchema = z.enum([
  "inProgress",
  "approved",
  "denied",
  "timedOut",
  "aborted",
])

const approvalActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      command: z.string(),
      type: z.literal("command"),
    })
    .passthrough(),
  z
    .object({
      argv: z.array(z.string()),
      program: z.string(),
      type: z.literal("execve"),
    })
    .passthrough(),
  z
    .object({
      files: z.array(z.string()),
      type: z.literal("applyPatch"),
    })
    .passthrough(),
  z
    .object({
      protocol: z.enum(["http", "https", "socks5Tcp", "socks5Udp"]),
      target: z.string(),
      type: z.literal("networkAccess"),
    })
    .passthrough(),
  z
    .object({
      server: z.string(),
      toolName: z.string(),
      type: z.literal("mcpToolCall"),
    })
    .passthrough(),
  z
    .object({
      permissions: z
        .object({
          fileSystem: z.unknown().nullable().optional(),
          network: z.unknown().nullable().optional(),
        })
        .passthrough(),
      type: z.literal("requestPermissions"),
    })
    .passthrough(),
])

export const codexAppServerApprovalReviewNotificationSchema = z
  .object({
    action: approvalActionSchema,
    review: z.object({ status: approvalReviewStatusSchema }).passthrough(),
    reviewId: z.string().min(1),
    threadId: z.string().min(1),
    turnId: z.string().min(1),
  })
  .passthrough()

export type CodexAppServerConsumedItem = z.infer<typeof consumedItemSchema>
export type CodexAppServerApprovalAction = z.infer<typeof approvalActionSchema>
