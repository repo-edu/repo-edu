import {
  type CodexAppServerApprovalAction,
  type CodexAppServerConsumedItem,
  codexAppServerApprovalReviewNotificationSchema,
  codexAppServerErrorNotificationSchema,
  codexAppServerGuardianWarningNotificationSchema,
  codexAppServerItemLifecycleNotificationSchema,
  codexAppServerTokenUsageUpdatedNotificationSchema,
  codexAppServerTurnPlanUpdatedNotificationSchema,
  codexAppServerWarningNotificationSchema,
} from "./codex-app-server-event-schemas.js"
import type {
  CodexAppServerApprovalPolicy,
  CodexAppServerApprovalsReviewer,
} from "./codex-app-server-schemas.js"
import { codingCommandActivity } from "./coding-command-display.js"
import type {
  CodingApprovalPolicy,
  CodingApprovalReviewAction,
  CodingEvent,
  CodingFileChange,
  CodingTokenUsageBreakdown,
} from "./contracts.js"

export type CodexAppServerEventMapper = {
  notification(method: string, params: unknown): void
}

type CodexAppServerEventMapperOptions = {
  readonly threadId: string
  readonly effectiveApprovalPolicy: CodexAppServerApprovalPolicy
  readonly effectiveApprovalsReviewer: CodexAppServerApprovalsReviewer
  readonly emit: (event: CodingEvent) => void
}

const FAILED_COMMAND_OUTPUT_LIMIT = 2_000

function semanticApprovalPolicy(
  policy: CodexAppServerApprovalPolicy,
): CodingApprovalPolicy {
  if (typeof policy === "string") return policy
  return {
    mode: "granular",
    mcpElicitations: policy.granular.mcp_elicitations,
    requestPermissions: policy.granular.request_permissions ?? null,
    rules: policy.granular.rules,
    sandboxApproval: policy.granular.sandbox_approval,
    skillApproval: policy.granular.skill_approval ?? null,
  }
}

function failedCommandOutput(value: string | null | undefined): string {
  const trimmed = value?.trimEnd() ?? ""
  return trimmed.length <= FAILED_COMMAND_OUTPUT_LIMIT
    ? trimmed
    : trimmed.slice(-FAILED_COMMAND_OUTPUT_LIMIT)
}

function tokenUsageBreakdown(
  value: CodingTokenUsageBreakdown,
): CodingTokenUsageBreakdown {
  return {
    inputTokens: value.inputTokens,
    cachedInputTokens: value.cachedInputTokens,
    cacheWriteInputTokens: value.cacheWriteInputTokens,
    outputTokens: value.outputTokens,
    reasoningOutputTokens: value.reasoningOutputTokens,
    totalTokens: value.totalTokens,
  }
}

function permissionKinds(
  permissions: Extract<
    CodexAppServerApprovalAction,
    { readonly type: "requestPermissions" }
  >["permissions"],
): string {
  const kinds: string[] = []
  if (permissions.fileSystem != null) kinds.push("file system")
  if (permissions.network != null) kinds.push("network")
  return kinds.length === 0 ? "none" : kinds.join(", ")
}

export function summarizeCodexAppServerApprovalAction(
  action: CodexAppServerApprovalAction,
): CodingApprovalReviewAction {
  switch (action.type) {
    case "command":
      return {
        kind: "command",
        summary: codingCommandActivity(action.command, "started"),
      }
    case "execve":
      return {
        kind: "command",
        summary: codingCommandActivity(
          [action.program, ...action.argv].join(" "),
          "started",
        ),
      }
    case "applyPatch":
      return {
        kind: "patch",
        summary: `Edit files: ${action.files.join(", ")}`,
      }
    case "networkAccess":
      return {
        kind: "network",
        summary: `Access ${action.target} over ${action.protocol}`,
      }
    case "mcpToolCall":
      return {
        kind: "mcp",
        summary: `Use tool: ${action.server}.${action.toolName}`,
      }
    case "requestPermissions":
      return {
        kind: "permissions",
        summary: `Request permissions: ${permissionKinds(action.permissions)}`,
      }
  }
}

function fileChanges(
  item: Extract<CodexAppServerConsumedItem, { readonly type: "fileChange" }>,
): readonly CodingFileChange[] {
  return item.changes.map((change) => ({
    path: change.path,
    kind: change.kind.type,
  }))
}

export function createCodexAppServerEventMapper(
  options: CodexAppServerEventMapperOptions,
): CodexAppServerEventMapper {
  if (options.threadId.length === 0) {
    throw new Error("The Codex app-server thread ID must not be empty.")
  }

  const startedCommands = new Set<string>()
  const settledCommands = new Set<string>()
  const completedReasoning = new Set<string>()
  const settledFileChanges = new Set<string>()
  const startedToolCalls = new Set<string>()
  const settledToolCalls = new Set<string>()
  const emittedWebSearches = new Set<string>()
  const compactionStates = new Set<string>()
  const reviewStates = new Map<string, string>()
  let lastTodo: string | null = null

  options.emit({
    kind: "thread-started",
    threadId: options.threadId,
    effectiveApprovalPolicy: semanticApprovalPolicy(
      options.effectiveApprovalPolicy,
    ),
    effectiveApprovalsReviewer: options.effectiveApprovalsReviewer,
  })

  const emitItem = (
    item: CodexAppServerConsumedItem,
    lifecycle: "started" | "completed",
  ): void => {
    if (
      lifecycle === "completed" &&
      "status" in item &&
      item.status === "inProgress"
    ) {
      throw new Error(
        `Codex app-server completed ${item.type} item ${item.id} while it was still in progress.`,
      )
    }

    switch (item.type) {
      case "reasoning":
        if (lifecycle !== "completed" || completedReasoning.has(item.id)) {
          return
        }
        completedReasoning.add(item.id)
        for (const summary of item.summary) {
          const text = summary.trim()
          if (text !== "") options.emit({ kind: "narrative", text })
        }
        return
      case "commandExecution": {
        if (item.status === "inProgress") {
          if (startedCommands.has(item.id)) return
          startedCommands.add(item.id)
          options.emit({
            kind: "command",
            command: item.command,
            status: "started",
            exitCode: null,
            output: "",
          })
          return
        }
        if (settledCommands.has(item.id)) return
        settledCommands.add(item.id)
        const failed = item.status === "failed" || item.status === "declined"
        options.emit({
          kind: "command",
          command: item.command,
          status: failed ? "failed" : "succeeded",
          exitCode: item.exitCode ?? null,
          output: failed ? failedCommandOutput(item.aggregatedOutput) : "",
        })
        return
      }
      case "fileChange":
        if (lifecycle !== "completed" || settledFileChanges.has(item.id)) {
          return
        }
        settledFileChanges.add(item.id)
        options.emit({
          kind: "file-change",
          status: item.status === "completed" ? "completed" : "failed",
          changes: fileChanges(item),
        })
        return
      case "mcpToolCall":
        if (item.status === "inProgress") {
          if (startedToolCalls.has(item.id)) return
          startedToolCalls.add(item.id)
          options.emit({
            kind: "tool-call",
            server: item.server,
            tool: item.tool,
            status: "started",
          })
          return
        }
        if (settledToolCalls.has(item.id)) return
        settledToolCalls.add(item.id)
        options.emit({
          kind: "tool-call",
          server: item.server,
          tool: item.tool,
          status: item.status === "failed" ? "failed" : "succeeded",
        })
        return
      case "webSearch":
        if (emittedWebSearches.has(item.id)) return
        emittedWebSearches.add(item.id)
        options.emit({ kind: "web-search", query: item.query })
        return
      case "contextCompaction": {
        const status = lifecycle
        const state = `${item.id}:${status}`
        if (compactionStates.has(state)) return
        compactionStates.add(state)
        options.emit({ kind: "context-compaction", status })
        return
      }
      default:
        return
    }
  }

  return {
    notification(method, params) {
      switch (method) {
        case "item/started":
        case "item/completed": {
          const notification =
            codexAppServerItemLifecycleNotificationSchema.parse(params)
          if (notification.threadId !== options.threadId) return
          emitItem(
            notification.item,
            method === "item/started" ? "started" : "completed",
          )
          return
        }
        case "turn/plan/updated": {
          const notification =
            codexAppServerTurnPlanUpdatedNotificationSchema.parse(params)
          if (notification.threadId !== options.threadId) return
          const todo = notification.plan.find(
            (step) => step.status !== "completed",
          )?.step
          if (todo === undefined || todo === lastTodo) return
          lastTodo = todo
          options.emit({ kind: "todo", text: todo })
          return
        }
        case "thread/tokenUsage/updated": {
          const notification =
            codexAppServerTokenUsageUpdatedNotificationSchema.parse(params)
          if (notification.threadId !== options.threadId) return
          options.emit({
            kind: "usage",
            usage: {
              cumulative: tokenUsageBreakdown(notification.tokenUsage.total),
              lastContext: tokenUsageBreakdown(notification.tokenUsage.last),
              modelContextWindowTokens:
                notification.tokenUsage.modelContextWindow ?? null,
            },
          })
          return
        }
        case "error": {
          const notification =
            codexAppServerErrorNotificationSchema.parse(params)
          if (notification.threadId !== options.threadId) return
          options.emit({
            kind: "error",
            message: notification.error.message,
            willRetry: notification.willRetry,
          })
          return
        }
        case "warning": {
          const notification =
            codexAppServerWarningNotificationSchema.parse(params)
          if (
            notification.threadId != null &&
            notification.threadId !== options.threadId
          ) {
            return
          }
          options.emit({
            kind: "warning",
            source: "app-server",
            message: notification.message,
          })
          return
        }
        case "guardianWarning": {
          const notification =
            codexAppServerGuardianWarningNotificationSchema.parse(params)
          if (notification.threadId !== options.threadId) return
          options.emit({
            kind: "warning",
            source: "guardian",
            message: notification.message,
          })
          return
        }
        case "item/autoApprovalReview/started":
        case "item/autoApprovalReview/completed": {
          const notification =
            codexAppServerApprovalReviewNotificationSchema.parse(params)
          if (notification.threadId !== options.threadId) return
          if (
            reviewStates.get(notification.reviewId) ===
            notification.review.status
          ) {
            return
          }
          reviewStates.set(notification.reviewId, notification.review.status)
          options.emit({
            kind: "approval-review",
            reviewId: notification.reviewId,
            status: notification.review.status,
            action: summarizeCodexAppServerApprovalAction(notification.action),
          })
        }
      }
    },
  }
}
