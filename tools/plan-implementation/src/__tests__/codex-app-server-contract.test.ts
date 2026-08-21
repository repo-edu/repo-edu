import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { promisify } from "node:util"
import { resolveCodexAppServerCommand } from "../codex-app-server-command.js"
import {
  buildCodexAppServerInitializeParams,
  buildCodexAppServerThreadStartParams,
  CODEX_APP_SERVER_OPT_OUT_NOTIFICATION_METHODS,
} from "../codex-app-server-connection.js"

const executeFile = promisify(execFile)

type JsonObject = Record<string, unknown>

function object(value: unknown, description: string): JsonObject {
  assert.equal(
    typeof value === "object" && value !== null && !Array.isArray(value),
    true,
    `${description} must be an object`,
  )
  return value as JsonObject
}

function properties(schema: unknown, description: string): JsonObject {
  return object(
    object(schema, description).properties,
    `${description}.properties`,
  )
}

function definitions(schema: unknown): JsonObject {
  return object(object(schema, "schema").definitions, "schema.definitions")
}

function collectEnumStrings(value: unknown, collected = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectEnumStrings(entry, collected)
    return collected
  }
  if (typeof value !== "object" || value === null) return collected
  for (const [key, entry] of Object.entries(value)) {
    if (key === "enum" && Array.isArray(entry)) {
      for (const member of entry) {
        if (typeof member === "string") collected.add(member)
      }
    }
    collectEnumStrings(entry, collected)
  }
  return collected
}

function findTaggedSchema(value: unknown, type: string): JsonObject | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findTaggedSchema(entry, type)
      if (found !== null) return found
    }
    return null
  }
  if (typeof value !== "object" || value === null) return null
  const schema = value as JsonObject
  if (
    typeof schema.properties === "object" &&
    schema.properties !== null &&
    !Array.isArray(schema.properties)
  ) {
    const schemaProperties = schema.properties as JsonObject
    if (collectEnumStrings(schemaProperties.type).has(type)) return schema
  }
  for (const entry of Object.values(schema)) {
    const found = findTaggedSchema(entry, type)
    if (found !== null) return found
  }
  return null
}

async function readJson(path: string): Promise<JsonObject> {
  return object(JSON.parse(await readFile(path, "utf8")), path)
}

function assertProperties(
  schema: unknown,
  description: string,
  expected: readonly string[],
): void {
  const actual = properties(schema, description)
  for (const name of expected) {
    assert.equal(name in actual, true, `${description} is missing ${name}`)
  }
}

describe("installed Codex app-server contract", () => {
  it("contains every startup shape, field, and notification opt-out the runner consumes", {
    skip: process.platform !== "darwin" && process.platform !== "linux",
  }, async (context) => {
    const output = await mkdtemp(join(tmpdir(), "repo-edu-codex-schema-"))
    context.after(async () => rm(output, { recursive: true, force: true }))
    const command = resolveCodexAppServerCommand()
    await executeFile(
      command.command,
      [...command.arguments, "generate-json-schema", "--out", output],
      { maxBuffer: 10 * 1024 * 1024 },
    )

    const [
      clientRequest,
      clientNotification,
      serverRequest,
      serverNotification,
      initializeParams,
      initializeResponse,
      threadStartParams,
      threadStartResponse,
      turnStartParams,
      turnStartResponse,
      turnInterruptParams,
      turnInterruptResponse,
      turnCompletedNotification,
      itemStartedNotification,
      itemCompletedNotification,
      turnPlanUpdatedNotification,
      tokenUsageUpdatedNotification,
      errorNotification,
      warningNotification,
      guardianWarningNotification,
      approvalReviewStartedNotification,
      approvalReviewCompletedNotification,
      commandApprovalParams,
      commandApprovalResponse,
      legacyCommandApprovalParams,
      legacyCommandApprovalResponse,
      fileApprovalParams,
      fileApprovalResponse,
      legacyPatchApprovalParams,
      legacyPatchApprovalResponse,
      permissionsApprovalParams,
      permissionsApprovalResponse,
      toolUserInputParams,
      toolUserInputResponse,
      mcpElicitationResponse,
      tokenRefreshParams,
      serverRequestResolvedNotification,
      protocolError,
      combined,
    ] = await Promise.all([
      readJson(join(output, "ClientRequest.json")),
      readJson(join(output, "ClientNotification.json")),
      readJson(join(output, "ServerRequest.json")),
      readJson(join(output, "ServerNotification.json")),
      readJson(join(output, "v1", "InitializeParams.json")),
      readJson(join(output, "v1", "InitializeResponse.json")),
      readJson(join(output, "v2", "ThreadStartParams.json")),
      readJson(join(output, "v2", "ThreadStartResponse.json")),
      readJson(join(output, "v2", "TurnStartParams.json")),
      readJson(join(output, "v2", "TurnStartResponse.json")),
      readJson(join(output, "v2", "TurnInterruptParams.json")),
      readJson(join(output, "v2", "TurnInterruptResponse.json")),
      readJson(join(output, "v2", "TurnCompletedNotification.json")),
      readJson(join(output, "v2", "ItemStartedNotification.json")),
      readJson(join(output, "v2", "ItemCompletedNotification.json")),
      readJson(join(output, "v2", "TurnPlanUpdatedNotification.json")),
      readJson(join(output, "v2", "ThreadTokenUsageUpdatedNotification.json")),
      readJson(join(output, "v2", "ErrorNotification.json")),
      readJson(join(output, "v2", "WarningNotification.json")),
      readJson(join(output, "v2", "GuardianWarningNotification.json")),
      readJson(
        join(
          output,
          "v2",
          "ItemGuardianApprovalReviewStartedNotification.json",
        ),
      ),
      readJson(
        join(
          output,
          "v2",
          "ItemGuardianApprovalReviewCompletedNotification.json",
        ),
      ),
      readJson(join(output, "CommandExecutionRequestApprovalParams.json")),
      readJson(join(output, "CommandExecutionRequestApprovalResponse.json")),
      readJson(join(output, "ExecCommandApprovalParams.json")),
      readJson(join(output, "ExecCommandApprovalResponse.json")),
      readJson(join(output, "FileChangeRequestApprovalParams.json")),
      readJson(join(output, "FileChangeRequestApprovalResponse.json")),
      readJson(join(output, "ApplyPatchApprovalParams.json")),
      readJson(join(output, "ApplyPatchApprovalResponse.json")),
      readJson(join(output, "PermissionsRequestApprovalParams.json")),
      readJson(join(output, "PermissionsRequestApprovalResponse.json")),
      readJson(join(output, "ToolRequestUserInputParams.json")),
      readJson(join(output, "ToolRequestUserInputResponse.json")),
      readJson(join(output, "McpServerElicitationRequestResponse.json")),
      readJson(join(output, "ChatgptAuthTokensRefreshParams.json")),
      readJson(join(output, "v2", "ServerRequestResolvedNotification.json")),
      readJson(join(output, "JSONRPCErrorError.json")),
      readJson(join(output, "codex_app_server_protocol.schemas.json")),
    ])

    const clientMethods = collectEnumStrings(clientRequest)
    assert.equal(clientMethods.has("initialize"), true)
    assert.equal(clientMethods.has("thread/start"), true)
    assert.equal(clientMethods.has("turn/start"), true)
    assert.equal(clientMethods.has("turn/interrupt"), true)
    assert.equal(
      collectEnumStrings(clientNotification).has("initialized"),
      true,
    )
    const serverMethods = collectEnumStrings(serverNotification)
    assert.equal(serverMethods.has("turn/completed"), true)
    for (const method of [
      "item/started",
      "item/completed",
      "turn/plan/updated",
      "thread/tokenUsage/updated",
      "error",
      "warning",
      "guardianWarning",
      "item/autoApprovalReview/started",
      "item/autoApprovalReview/completed",
    ]) {
      assert.equal(serverMethods.has(method), true, `missing event ${method}`)
    }
    for (const method of CODEX_APP_SERVER_OPT_OUT_NOTIFICATION_METHODS) {
      assert.equal(
        serverMethods.has(method),
        true,
        `missing notification ${method}`,
      )
    }
    const serverRequestMethods = collectEnumStrings(serverRequest)
    for (const method of [
      "item/commandExecution/requestApproval",
      "execCommandApproval",
      "item/fileChange/requestApproval",
      "applyPatchApproval",
      "item/permissions/requestApproval",
      "item/tool/requestUserInput",
      "mcpServer/elicitation/request",
      "item/tool/call",
      "attestation/generate",
      "account/chatgptAuthTokens/refresh",
    ]) {
      assert.equal(
        serverRequestMethods.has(method),
        true,
        `missing server request ${method}`,
      )
    }

    assertProperties(initializeParams, "InitializeParams", [
      "clientInfo",
      "capabilities",
    ])
    const initializeDefinitions = definitions(initializeParams)
    assertProperties(initializeDefinitions.ClientInfo, "ClientInfo", [
      "name",
      "title",
      "version",
    ])
    assertProperties(
      initializeDefinitions.InitializeCapabilities,
      "InitializeCapabilities",
      ["experimentalApi", "optOutNotificationMethods", "requestAttestation"],
    )
    assertProperties(initializeResponse, "InitializeResponse", [
      "codexHome",
      "platformFamily",
      "platformOs",
      "userAgent",
    ])
    assertProperties(threadStartParams, "ThreadStartParams", [
      "approvalPolicy",
      "approvalsReviewer",
      "config",
      "cwd",
      "sandbox",
    ])
    assertProperties(threadStartResponse, "ThreadStartResponse", [
      "approvalPolicy",
      "approvalsReviewer",
      "thread",
    ])
    assertProperties(turnStartParams, "TurnStartParams", [
      "input",
      "outputSchema",
      "threadId",
    ])
    const textInput = findTaggedSchema(turnStartParams, "text")
    assert.notEqual(textInput, null, "TurnStartParams is missing text input")
    assertProperties(textInput, "Text user input", [
      "text",
      "text_elements",
      "type",
    ])
    assertProperties(turnStartResponse, "TurnStartResponse", ["turn"])
    assertProperties(turnInterruptParams, "TurnInterruptParams", [
      "threadId",
      "turnId",
    ])
    assert.equal(turnInterruptResponse.type, "object")
    assertProperties(turnCompletedNotification, "TurnCompletedNotification", [
      "threadId",
      "turn",
    ])
    const turnDefinitions = definitions(turnCompletedNotification)
    assertProperties(turnDefinitions.Turn, "Turn", [
      "error",
      "id",
      "items",
      "status",
    ])
    assert.equal(
      collectEnumStrings(turnDefinitions.TurnStatus).has("completed"),
      true,
    )
    assert.equal(
      collectEnumStrings(turnDefinitions.TurnStatus).has("interrupted"),
      true,
    )
    assert.equal(
      collectEnumStrings(turnDefinitions.TurnStatus).has("failed"),
      true,
    )
    assert.equal(
      collectEnumStrings(turnDefinitions.MessagePhase).has("final_answer"),
      true,
    )
    const agentMessage = findTaggedSchema(
      turnDefinitions.ThreadItem,
      "agentMessage",
    )
    assert.notEqual(agentMessage, null, "ThreadItem is missing agentMessage")
    assertProperties(agentMessage, "AgentMessage", [
      "id",
      "phase",
      "text",
      "type",
    ])

    for (const [schema, description] of [
      [itemStartedNotification, "ItemStartedNotification"],
      [itemCompletedNotification, "ItemCompletedNotification"],
    ] as const) {
      assertProperties(schema, description, ["item", "threadId", "turnId"])
    }
    const itemDefinitions = definitions(itemStartedNotification)
    for (const [type, fields] of [
      ["reasoning", ["id", "summary", "content", "type"]],
      [
        "commandExecution",
        ["aggregatedOutput", "command", "exitCode", "id", "status", "type"],
      ],
      ["fileChange", ["changes", "id", "status", "type"]],
      ["mcpToolCall", ["id", "server", "status", "tool", "type"]],
      ["webSearch", ["id", "query", "type"]],
      ["contextCompaction", ["id", "type"]],
    ] as const) {
      const item = findTaggedSchema(itemDefinitions.ThreadItem, type)
      assert.notEqual(item, null, `ThreadItem is missing ${type}`)
      assertProperties(item, `${type} item`, fields)
    }
    assertProperties(itemDefinitions.FileUpdateChange, "FileUpdateChange", [
      "kind",
      "path",
    ])
    for (const status of ["inProgress", "completed", "failed", "declined"]) {
      assert.equal(
        collectEnumStrings(itemDefinitions.CommandExecutionStatus).has(status),
        true,
        `CommandExecutionStatus is missing ${status}`,
      )
      assert.equal(
        collectEnumStrings(itemDefinitions.PatchApplyStatus).has(status),
        true,
        `PatchApplyStatus is missing ${status}`,
      )
    }
    for (const status of ["inProgress", "completed", "failed"]) {
      assert.equal(
        collectEnumStrings(itemDefinitions.McpToolCallStatus).has(status),
        true,
        `McpToolCallStatus is missing ${status}`,
      )
    }
    for (const kind of ["add", "delete", "update"]) {
      assert.equal(
        collectEnumStrings(itemDefinitions.PatchChangeKind).has(kind),
        true,
        `PatchChangeKind is missing ${kind}`,
      )
    }
    assertProperties(
      turnPlanUpdatedNotification,
      "TurnPlanUpdatedNotification",
      ["plan", "threadId", "turnId"],
    )
    assertProperties(
      definitions(turnPlanUpdatedNotification).TurnPlanStep,
      "TurnPlanStep",
      ["status", "step"],
    )
    for (const status of ["pending", "inProgress", "completed"]) {
      assert.equal(
        collectEnumStrings(
          definitions(turnPlanUpdatedNotification).TurnPlanStepStatus,
        ).has(status),
        true,
        `TurnPlanStepStatus is missing ${status}`,
      )
    }
    assertProperties(
      tokenUsageUpdatedNotification,
      "ThreadTokenUsageUpdatedNotification",
      ["threadId", "tokenUsage", "turnId"],
    )
    const usageDefinitions = definitions(tokenUsageUpdatedNotification)
    assertProperties(usageDefinitions.ThreadTokenUsage, "ThreadTokenUsage", [
      "last",
      "modelContextWindow",
      "total",
    ])
    assertProperties(
      usageDefinitions.TokenUsageBreakdown,
      "TokenUsageBreakdown",
      [
        "cacheWriteInputTokens",
        "cachedInputTokens",
        "inputTokens",
        "outputTokens",
        "reasoningOutputTokens",
        "totalTokens",
      ],
    )
    assertProperties(errorNotification, "ErrorNotification", [
      "error",
      "threadId",
      "turnId",
      "willRetry",
    ])
    assertProperties(warningNotification, "WarningNotification", [
      "message",
      "threadId",
    ])
    assertProperties(
      guardianWarningNotification,
      "GuardianWarningNotification",
      ["message", "threadId"],
    )
    for (const [schema, description] of [
      [
        approvalReviewStartedNotification,
        "ItemGuardianApprovalReviewStartedNotification",
      ],
      [
        approvalReviewCompletedNotification,
        "ItemGuardianApprovalReviewCompletedNotification",
      ],
    ] as const) {
      assertProperties(schema, description, [
        "action",
        "review",
        "reviewId",
        "threadId",
        "turnId",
      ])
    }
    const reviewDefinitions = definitions(approvalReviewStartedNotification)
    for (const [type, fields] of [
      ["command", ["command", "type"]],
      ["execve", ["argv", "program", "type"]],
      ["applyPatch", ["files", "type"]],
      ["networkAccess", ["protocol", "target", "type"]],
      ["mcpToolCall", ["server", "toolName", "type"]],
      ["requestPermissions", ["permissions", "type"]],
    ] as const) {
      const action = findTaggedSchema(
        reviewDefinitions.GuardianApprovalReviewAction,
        type,
      )
      assert.notEqual(
        action,
        null,
        `GuardianApprovalReviewAction is missing ${type}`,
      )
      assertProperties(action, `${type} approval action`, fields)
    }
    assertProperties(
      reviewDefinitions.RequestPermissionProfile,
      "RequestPermissionProfile",
      ["fileSystem", "network"],
    )
    for (const protocol of ["http", "https", "socks5Tcp", "socks5Udp"]) {
      assert.equal(
        collectEnumStrings(reviewDefinitions.NetworkApprovalProtocol).has(
          protocol,
        ),
        true,
        `NetworkApprovalProtocol is missing ${protocol}`,
      )
    }
    for (const status of [
      "inProgress",
      "approved",
      "denied",
      "timedOut",
      "aborted",
    ]) {
      assert.equal(
        collectEnumStrings(reviewDefinitions.GuardianApprovalReviewStatus).has(
          status,
        ),
        true,
        `GuardianApprovalReviewStatus is missing ${status}`,
      )
    }

    for (const [schema, description, fields] of [
      [
        commandApprovalParams,
        "CommandExecutionRequestApprovalParams",
        ["command", "itemId", "startedAtMs", "threadId", "turnId"],
      ],
      [
        legacyCommandApprovalParams,
        "ExecCommandApprovalParams",
        ["command", "conversationId"],
      ],
      [
        fileApprovalParams,
        "FileChangeRequestApprovalParams",
        ["grantRoot", "itemId", "startedAtMs", "threadId", "turnId"],
      ],
      [
        legacyPatchApprovalParams,
        "ApplyPatchApprovalParams",
        ["conversationId", "fileChanges"],
      ],
      [
        permissionsApprovalParams,
        "PermissionsRequestApprovalParams",
        ["permissions", "threadId", "turnId"],
      ],
      [
        toolUserInputParams,
        "ToolRequestUserInputParams",
        ["isBlocking", "itemId", "questions", "threadId", "turnId"],
      ],
    ] as const) {
      assertProperties(schema, description, fields)
    }
    for (const [schema, description, field] of [
      [
        commandApprovalResponse,
        "CommandExecutionRequestApprovalResponse",
        "decision",
      ],
      [
        legacyCommandApprovalResponse,
        "ExecCommandApprovalResponse",
        "decision",
      ],
      [fileApprovalResponse, "FileChangeRequestApprovalResponse", "decision"],
      [legacyPatchApprovalResponse, "ApplyPatchApprovalResponse", "decision"],
      [
        permissionsApprovalResponse,
        "PermissionsRequestApprovalResponse",
        "permissions",
      ],
      [toolUserInputResponse, "ToolRequestUserInputResponse", "answers"],
    ] as const) {
      assertProperties(schema, description, [field])
    }
    for (const decision of [
      "accept",
      "acceptForSession",
      "decline",
      "cancel",
    ]) {
      assert.equal(
        collectEnumStrings(commandApprovalResponse).has(decision),
        true,
        `CommandExecutionApprovalDecision is missing ${decision}`,
      )
      assert.equal(
        collectEnumStrings(fileApprovalResponse).has(decision),
        true,
        `FileChangeApprovalDecision is missing ${decision}`,
      )
    }
    for (const decision of ["approved", "approved_for_session", "abort"]) {
      assert.equal(
        collectEnumStrings(legacyCommandApprovalResponse).has(decision),
        true,
        `ReviewDecision is missing ${decision}`,
      )
    }
    assert.equal(
      collectEnumStrings(mcpElicitationResponse).has("decline"),
      true,
      "McpServerElicitationAction is missing decline",
    )
    assertProperties(
      definitions(toolUserInputParams).ToolRequestUserInputQuestion,
      "ToolRequestUserInputQuestion",
      ["header", "id", "isOther", "isSecret", "options", "question"],
    )
    assertProperties(tokenRefreshParams, "ChatgptAuthTokensRefreshParams", [
      "reason",
    ])
    assert.equal(
      collectEnumStrings(tokenRefreshParams).has("unauthorized"),
      true,
      "ChatgptAuthTokensRefreshReason is missing unauthorized",
    )
    assertProperties(
      serverRequestResolvedNotification,
      "ServerRequestResolvedNotification",
      ["requestId", "threadId"],
    )
    assert.equal(serverMethods.has("serverRequest/resolved"), true)
    assertProperties(protocolError, "JSONRPCErrorError", ["code", "message"])

    const combinedDefinitions = definitions(combined)
    const v2Definitions = object(
      combinedDefinitions.v2,
      "schema.definitions.v2",
    )
    assert.equal(
      collectEnumStrings(v2Definitions.AskForApproval).has(
        buildCodexAppServerThreadStartParams("/repo-edu").approvalPolicy,
      ),
      true,
    )
    assert.equal(
      collectEnumStrings(v2Definitions.ApprovalsReviewer).has(
        buildCodexAppServerThreadStartParams("/repo-edu").approvalsReviewer,
      ),
      true,
    )
    assert.equal(
      collectEnumStrings(v2Definitions.SandboxMode).has(
        buildCodexAppServerThreadStartParams("/repo-edu").sandbox,
      ),
      true,
    )
    assert.equal(
      collectEnumStrings(v2Definitions.WebSearchMode).has(
        buildCodexAppServerThreadStartParams("/repo-edu").config.web_search,
      ),
      true,
    )
    assertProperties(v2Definitions.Config, "Config", [
      "sandbox_workspace_write",
      "web_search",
    ])
    assertProperties(
      v2Definitions.SandboxWorkspaceWrite,
      "SandboxWorkspaceWrite",
      ["network_access"],
    )

    assert.deepEqual(buildCodexAppServerInitializeParams().capabilities, {
      experimentalApi: false,
      optOutNotificationMethods: CODEX_APP_SERVER_OPT_OUT_NOTIFICATION_METHODS,
      requestAttestation: false,
    })
  })
})
