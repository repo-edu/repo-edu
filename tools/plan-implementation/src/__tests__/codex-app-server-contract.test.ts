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
      serverNotification,
      initializeParams,
      initializeResponse,
      threadStartParams,
      threadStartResponse,
      protocolError,
      combined,
    ] = await Promise.all([
      readJson(join(output, "ClientRequest.json")),
      readJson(join(output, "ClientNotification.json")),
      readJson(join(output, "ServerNotification.json")),
      readJson(join(output, "v1", "InitializeParams.json")),
      readJson(join(output, "v1", "InitializeResponse.json")),
      readJson(join(output, "v2", "ThreadStartParams.json")),
      readJson(join(output, "v2", "ThreadStartResponse.json")),
      readJson(join(output, "JSONRPCErrorError.json")),
      readJson(join(output, "codex_app_server_protocol.schemas.json")),
    ])

    const clientMethods = collectEnumStrings(clientRequest)
    assert.equal(clientMethods.has("initialize"), true)
    assert.equal(clientMethods.has("thread/start"), true)
    assert.equal(
      collectEnumStrings(clientNotification).has("initialized"),
      true,
    )
    const serverMethods = collectEnumStrings(serverNotification)
    for (const method of CODEX_APP_SERVER_OPT_OUT_NOTIFICATION_METHODS) {
      assert.equal(
        serverMethods.has(method),
        true,
        `missing notification ${method}`,
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
