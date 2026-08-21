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

export type CodexAppServerApprovalPolicy = z.infer<
  typeof codexAppServerApprovalPolicySchema
>
export type CodexAppServerApprovalsReviewer = z.infer<
  typeof codexAppServerApprovalsReviewerSchema
>
export type CodexAppServerInitializeResponse = z.infer<
  typeof codexAppServerInitializeResponseSchema
>
