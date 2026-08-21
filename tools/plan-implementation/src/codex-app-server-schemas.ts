import { z } from "zod"

const granularApprovalPolicySchema = z
  .object({
    granular: z
      .object({
        mcp_elicitations: z.boolean(),
        request_permissions: z.boolean().optional(),
        rules: z.boolean(),
        sandbox_approval: z.boolean(),
        skill_approval: z.boolean().optional(),
      })
      .strict(),
  })
  .strict()

export const codexAppServerApprovalPolicySchema = z.union([
  z.enum(["untrusted", "on-request", "never"]),
  granularApprovalPolicySchema,
])

export const codexAppServerApprovalsReviewerSchema = z.enum([
  "user",
  "auto_review",
  "guardian_subagent",
])

export const codexAppServerInitializeResponseSchema = z
  .object({
    codexHome: z.string().min(1),
    platformFamily: z.string().min(1),
    platformOs: z.string().min(1),
    userAgent: z.string().min(1),
  })
  .passthrough()

export const codexAppServerThreadStartResponseSchema = z
  .object({
    approvalPolicy: codexAppServerApprovalPolicySchema,
    approvalsReviewer: codexAppServerApprovalsReviewerSchema,
    thread: z.object({ id: z.string().min(1) }).passthrough(),
  })
  .passthrough()

export const codexAppServerProtocolErrorSchema = z
  .object({
    code: z.number().int(),
    data: z.unknown().optional(),
    message: z.string(),
  })
  .strict()

const codexAppServerMessagePhaseSchema = z.enum(["commentary", "final_answer"])

export const codexAppServerAgentMessageSchema = z
  .object({
    id: z.string().min(1),
    phase: codexAppServerMessagePhaseSchema.nullish(),
    text: z.string(),
    type: z.literal("agentMessage"),
  })
  .passthrough()

const codexAppServerOtherThreadItemSchema = z
  .object({
    type: z
      .string()
      .min(1)
      .refine((type) => type !== "agentMessage"),
  })
  .passthrough()

const codexAppServerThreadItemSchema = z.union([
  codexAppServerAgentMessageSchema,
  codexAppServerOtherThreadItemSchema,
])

const codexAppServerTurnErrorSchema = z
  .object({
    additionalDetails: z.string().nullable().optional(),
    codexErrorInfo: z.unknown().nullable().optional(),
    message: z.string().min(1),
  })
  .passthrough()

const codexAppServerTurnSchema = z
  .object({
    error: codexAppServerTurnErrorSchema.nullable(),
    id: z.string().min(1),
    items: z.array(codexAppServerThreadItemSchema),
    status: z.enum(["completed", "interrupted", "failed", "inProgress"]),
  })
  .passthrough()
  .superRefine((turn, context) => {
    if (turn.status === "failed" && turn.error === null) {
      context.addIssue({
        code: "custom",
        message: "A failed Codex app-server turn must include an error.",
        path: ["error"],
      })
    }
    if (turn.status !== "failed" && turn.error !== null) {
      context.addIssue({
        code: "custom",
        message: "Only a failed Codex app-server turn may include an error.",
        path: ["error"],
      })
    }
  })

export const codexAppServerTurnStartResponseSchema = z
  .object({ turn: codexAppServerTurnSchema })
  .passthrough()
  .refine((response) => response.turn.status === "inProgress", {
    message: "A started Codex app-server turn must be in progress.",
  })

export const codexAppServerTurnCompletedNotificationSchema = z
  .object({
    threadId: z.string().min(1),
    turn: codexAppServerTurnSchema,
  })
  .passthrough()
  .refine((notification) => notification.turn.status !== "inProgress", {
    message: "A completed Codex app-server turn must be terminal.",
  })

export type CodexAppServerApprovalPolicy = z.infer<
  typeof codexAppServerApprovalPolicySchema
>
export type CodexAppServerApprovalsReviewer = z.infer<
  typeof codexAppServerApprovalsReviewerSchema
>
export type CodexAppServerInitializeResponse = z.infer<
  typeof codexAppServerInitializeResponseSchema
>
export type CodexAppServerAgentMessage = z.infer<
  typeof codexAppServerAgentMessageSchema
>
export type CodexAppServerTurnCompletedNotification = z.infer<
  typeof codexAppServerTurnCompletedNotificationSchema
>
