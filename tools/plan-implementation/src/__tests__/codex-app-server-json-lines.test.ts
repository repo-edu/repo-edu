import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import type { Message } from "vscode-jsonrpc"
import {
  CodexAppServerJsonLineReader,
  CodexAppServerJsonLineWriter,
} from "../codex-app-server-json-lines.js"

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe("Codex app-server JSON-lines transport", () => {
  it("writes one headerless JSON-RPC value per line", async () => {
    const output = new PassThrough()
    let written = ""
    output.setEncoding("utf8")
    output.on("data", (chunk: string) => {
      written += chunk
    })
    const writer = new CodexAppServerJsonLineWriter(output)

    await writer.write({
      jsonrpc: "2.0",
      id: 7,
      method: "initialize",
      params: { clientInfo: { name: "runner" } },
    } as Message)

    assert.equal(
      written,
      '{"id":7,"method":"initialize","params":{"clientInfo":{"name":"runner"}}}\n',
    )
    writer.dispose()
  })

  it("reads split lines and restores the JSON-RPC header at the library edge", async () => {
    const input = new PassThrough()
    const reader = new CodexAppServerJsonLineReader(input)
    const messages: Message[] = []
    reader.listen((message) => messages.push(message))

    input.write('{"id":7,"res')
    input.write('ult":{"userAgent":"codex"}}\n')
    input.write('{"method":"thread/started","params":{"id":"t1"}}\n')
    await nextTurn()

    assert.deepEqual(messages, [
      { jsonrpc: "2.0", id: 7, result: { userAgent: "codex" } },
      {
        jsonrpc: "2.0",
        method: "thread/started",
        params: { id: "t1" },
      },
    ])
    reader.dispose()
  })

  it("closes the protocol reader after malformed JSON", async () => {
    const input = new PassThrough()
    const reader = new CodexAppServerJsonLineReader(input)
    const errors: Error[] = []
    const closed = Promise.withResolvers<void>()
    reader.onError((error) => errors.push(error))
    reader.onClose(() => closed.resolve())
    reader.listen(() => {})

    input.write("not-json\n")
    await closed.promise

    assert.equal(errors.length, 1)
    assert.match(errors[0]?.message ?? "", /JSON/)
    reader.dispose()
  })
})
