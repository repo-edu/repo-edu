import { ErrorCodes, ResponseError } from "vscode-jsonrpc/node"
import type {
  CodexAppServerConnection,
  CodexAppServerRequest,
  CodexAppServerRequestId,
} from "./codex-app-server-connection.js"
import { codexAppServerItemLifecycleNotificationSchema } from "./codex-app-server-event-schemas.js"
import {
  type CodexAppServerPermissionProfile,
  chatgptTokenRefreshParamsSchema,
  commandExecutionApprovalParamsSchema,
  fileChangeApprovalParamsSchema,
  legacyCommandApprovalParamsSchema,
  legacyPatchApprovalParamsSchema,
  permissionsApprovalParamsSchema,
  serverRequestResolvedNotificationSchema,
  toolRequestUserInputParamsSchema,
} from "./codex-app-server-review-schemas.js"
import { codingCommandActivity } from "./coding-command-display.js"
import type {
  CodingEvent,
  CodingHumanReviewCategory,
  CodingHumanReviewDecision,
} from "./contracts.js"
import type {
  HumanReviewPermission,
  HumanReviewPort,
  HumanReviewRequest,
  HumanReviewResponse,
} from "./human-review.js"

const noStaleResponse = new Promise<never>(() => {})

export type CodexAppServerReviewOwner = {
  dispose(): void
}

export type CodexAppServerReviewOptions = {
  readonly emit: (event: CodingEvent) => void
}

function protocolRequestKey(id: CodexAppServerRequestId): string {
  return `${typeof id}:${String(id)}`
}

function safePaths(paths: readonly string[]): string {
  return paths.length === 0
    ? "Review file changes"
    : `Edit files: ${paths.join(", ")}`
}

function permissionKinds(
  permissions: CodexAppServerPermissionProfile,
): readonly HumanReviewPermission[] {
  const kinds: HumanReviewPermission[] = []
  if (permissions.fileSystem != null) kinds.push("file-system")
  if (permissions.network != null) kinds.push("network")
  return kinds
}

function permissionSummary(
  permissions: readonly HumanReviewPermission[],
): string {
  const names = permissions.map((permission) =>
    permission === "file-system" ? "file system" : "network",
  )
  return `Request permissions: ${names.length === 0 ? "none" : names.join(", ")}`
}

function humanDecision(
  response: HumanReviewResponse,
): CodingHumanReviewDecision {
  switch (response.decision) {
    case "permissions":
      return response.scope === "session" ? "accepted-for-session" : "accepted"
    case "accepted":
    case "accepted-for-session":
    case "declined":
    case "cancelled":
    case "answered":
    case "cleared":
      return response.decision
  }
}

function ensureThread(threadId: string, expected: string): void {
  if (threadId !== expected) {
    throw new ResponseError(
      ErrorCodes.InvalidParams,
      "The Codex app-server review request belongs to another thread.",
    )
  }
}

function selectedPermissions(
  requested: CodexAppServerPermissionProfile,
  selected: readonly HumanReviewPermission[],
): CodexAppServerPermissionProfile {
  const granted: CodexAppServerPermissionProfile = {}
  if (selected.includes("file-system") && requested.fileSystem != null) {
    granted.fileSystem = requested.fileSystem
  }
  if (selected.includes("network") && requested.network != null) {
    granted.network = requested.network
  }
  return granted
}

function unsupportedSummary(method: string, params: unknown): string {
  switch (method) {
    case "mcpServer/elicitation/request":
      return "Unsupported MCP elicitation"
    case "item/tool/call":
      return "Unsupported dynamic tool call"
    case "attestation/generate":
      return "Unsupported attestation request"
    case "account/chatgptAuthTokens/refresh": {
      const parsed = chatgptTokenRefreshParamsSchema.safeParse(params)
      return parsed.success
        ? `Unsupported token refresh: ${parsed.data.reason}`
        : "Unsupported token refresh"
    }
    default:
      return `Unsupported app-server request: ${method}`
  }
}

function unsupportedRequest(
  request: CodexAppServerRequest,
  options: CodexAppServerReviewOptions,
): ResponseError<void> {
  const requestId = protocolRequestKey(request.id)
  options.emit({
    kind: "request-refused",
    requestId,
    summary: unsupportedSummary(request.method, request.params),
    response: "unsupported",
  })
  return new ResponseError(
    ErrorCodes.MethodNotFound,
    `The Codex app-server request ${request.method} is not supported.`,
  )
}

function declineMcpElicitation(
  request: CodexAppServerRequest,
  options: CodexAppServerReviewOptions,
): { readonly action: "decline" } {
  const requestId = protocolRequestKey(request.id)
  options.emit({
    kind: "request-refused",
    requestId,
    summary: "Unsupported MCP elicitation",
    response: "unsupported",
  })
  return { action: "decline" }
}

function completedEvent(
  requestId: string,
  category: CodingHumanReviewCategory,
  summary: string,
  response: HumanReviewResponse,
): CodingEvent {
  return {
    kind: "human-review",
    requestId,
    category,
    status: "completed",
    summary,
    decision: humanDecision(response),
  }
}

export function createCodexAppServerReviewOwner(
  connection: CodexAppServerConnection,
  humanReview: HumanReviewPort,
  options: CodexAppServerReviewOptions,
): CodexAppServerReviewOwner {
  const fileChanges = new Map<string, readonly string[]>()
  const openRequests = new Set<string>()

  const review = async (
    request: HumanReviewRequest,
    respond: (response: HumanReviewResponse) => unknown,
  ): Promise<unknown> => {
    openRequests.add(request.requestId)
    options.emit({
      kind: "human-review",
      requestId: request.requestId,
      category: request.category,
      status: "requested",
      summary: request.summary,
    })
    const response = await humanReview.review(request)
    openRequests.delete(request.requestId)
    options.emit(
      completedEvent(
        request.requestId,
        request.category,
        request.summary,
        response,
      ),
    )
    return response.decision === "cleared" ? noStaleResponse : respond(response)
  }

  const handler = connection.setServerRequestHandler((request) => {
    const requestId = protocolRequestKey(request.id)
    try {
      switch (request.method) {
        case "item/commandExecution/requestApproval": {
          const params = commandExecutionApprovalParamsSchema.parse(
            request.params,
          )
          ensureThread(params.threadId, connection.threadId)
          const summary = codingCommandActivity(
            params.command ?? `command item ${params.itemId}`,
            "started",
          )
          return review(
            {
              requestId,
              category: "command",
              summary,
              allowSession: true,
            },
            (response) => {
              switch (response.decision) {
                case "accepted":
                  return { decision: "accept" }
                case "accepted-for-session":
                  return { decision: "acceptForSession" }
                case "declined":
                  return { decision: "decline" }
                case "cancelled":
                  return { decision: "cancel" }
                default:
                  throw new Error(
                    `Unexpected command review response ${response.decision}.`,
                  )
              }
            },
          )
        }
        case "execCommandApproval": {
          const params = legacyCommandApprovalParamsSchema.parse(request.params)
          ensureThread(params.conversationId, connection.threadId)
          return review(
            {
              requestId,
              category: "command",
              summary: codingCommandActivity(
                params.command.length === 0
                  ? `command item ${params.callId}`
                  : params.command.join(" "),
                "started",
              ),
              allowSession: true,
            },
            (response) => {
              switch (response.decision) {
                case "accepted":
                  return { decision: "approved" }
                case "accepted-for-session":
                  return { decision: "approved_for_session" }
                case "declined":
                  return {
                    decision: {
                      denied: {
                        rejection: "The human reviewer declined this request.",
                      },
                    },
                  }
                case "cancelled":
                  return { decision: "abort" }
                default:
                  throw new Error(
                    `Unexpected command review response ${response.decision}.`,
                  )
              }
            },
          )
        }
        case "item/fileChange/requestApproval": {
          const params = fileChangeApprovalParamsSchema.parse(request.params)
          ensureThread(params.threadId, connection.threadId)
          return review(
            {
              requestId,
              category: "file-change",
              summary: safePaths(fileChanges.get(params.itemId) ?? []),
              allowSession: true,
            },
            (response) => {
              switch (response.decision) {
                case "accepted":
                  return { decision: "accept" }
                case "accepted-for-session":
                  return { decision: "acceptForSession" }
                case "declined":
                  return { decision: "decline" }
                case "cancelled":
                  return { decision: "cancel" }
                default:
                  throw new Error(
                    `Unexpected file review response ${response.decision}.`,
                  )
              }
            },
          )
        }
        case "applyPatchApproval": {
          const params = legacyPatchApprovalParamsSchema.parse(request.params)
          ensureThread(params.conversationId, connection.threadId)
          return review(
            {
              requestId,
              category: "file-change",
              summary: safePaths(Object.keys(params.fileChanges)),
              allowSession: true,
            },
            (response) => {
              switch (response.decision) {
                case "accepted":
                  return { decision: "approved" }
                case "accepted-for-session":
                  return { decision: "approved_for_session" }
                case "declined":
                  return {
                    decision: {
                      denied: {
                        rejection: "The human reviewer declined this request.",
                      },
                    },
                  }
                case "cancelled":
                  return { decision: "abort" }
                default:
                  throw new Error(
                    `Unexpected patch review response ${response.decision}.`,
                  )
              }
            },
          )
        }
        case "item/permissions/requestApproval": {
          const params = permissionsApprovalParamsSchema.parse(request.params)
          ensureThread(params.threadId, connection.threadId)
          const permissions = permissionKinds(params.permissions)
          return review(
            {
              requestId,
              category: "permission",
              summary: permissionSummary(permissions),
              permissions,
            },
            (response) => {
              if (response.decision === "permissions") {
                return {
                  permissions: selectedPermissions(
                    params.permissions,
                    response.permissions,
                  ),
                  scope: response.scope,
                }
              }
              if (
                response.decision === "declined" ||
                response.decision === "cancelled"
              ) {
                return { permissions: {}, scope: "turn" }
              }
              throw new Error(
                `Unexpected permission review response ${response.decision}.`,
              )
            },
          )
        }
        case "item/tool/requestUserInput": {
          const params = toolRequestUserInputParamsSchema.parse(request.params)
          ensureThread(params.threadId, connection.threadId)
          const questions = params.questions.map((question) => ({
            id: question.id,
            header: question.header,
            question: question.question,
            options: question.options ?? [],
            allowOther: question.isOther,
            secret: question.isSecret,
          }))
          const headers = questions
            .map((question) => question.header)
            .join(", ")
          return review(
            {
              requestId,
              category: "user-input",
              summary: `Answer Codex questions: ${headers}`,
              questions,
            },
            (response) => {
              if (response.decision === "answered") {
                return { answers: response.answers }
              }
              if (response.decision === "cancelled") return { answers: {} }
              throw new Error(
                `Unexpected user-input response ${response.decision}.`,
              )
            },
          )
        }
        case "mcpServer/elicitation/request":
          return declineMcpElicitation(request, options)
        default:
          return unsupportedRequest(request, options)
      }
    } catch (error) {
      if (error instanceof ResponseError) return error
      return new ResponseError(
        ErrorCodes.InvalidParams,
        `The Codex app-server request ${request.method} is malformed.`,
      )
    }
  })

  const rememberFileChanges = (params: unknown, completed: boolean): void => {
    const parsed =
      codexAppServerItemLifecycleNotificationSchema.safeParse(params)
    if (
      !parsed.success ||
      parsed.data.threadId !== connection.threadId ||
      parsed.data.item.type !== "fileChange"
    ) {
      return
    }
    if (completed) {
      fileChanges.delete(parsed.data.item.id)
      return
    }
    fileChanges.set(
      parsed.data.item.id,
      parsed.data.item.changes.map((change) => change.path),
    )
  }
  const notifications = connection.onNotification((method, params) => {
    switch (method) {
      case "item/started":
        rememberFileChanges(params, false)
        return
      case "item/completed":
        rememberFileChanges(params, true)
        return
      case "serverRequest/resolved": {
        const parsed = serverRequestResolvedNotificationSchema.safeParse(params)
        if (!parsed.success || parsed.data.threadId !== connection.threadId) {
          return
        }
        humanReview.clear(protocolRequestKey(parsed.data.requestId))
      }
    }
  })

  return {
    dispose() {
      handler.dispose()
      notifications.dispose()
      for (const requestId of openRequests) humanReview.clear(requestId)
      openRequests.clear()
      fileChanges.clear()
    },
  }
}
