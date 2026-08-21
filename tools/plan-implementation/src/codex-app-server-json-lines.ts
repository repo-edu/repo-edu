import { createInterface } from "node:readline"
import type { Readable, Writable } from "node:stream"
import {
  AbstractMessageReader,
  AbstractMessageWriter,
  type DataCallback,
  type Disposable,
  type Message,
} from "vscode-jsonrpc"

function normalizeInboundMessage(line: string): Message {
  const parsed: unknown = JSON.parse(line)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("A Codex app-server JSON line must contain an object.")
  }
  const record = parsed as Record<string, unknown>
  if (record.jsonrpc !== undefined && record.jsonrpc !== "2.0") {
    throw new Error(
      'A Codex app-server JSON line has an invalid "jsonrpc" value.',
    )
  }
  return { ...record, jsonrpc: "2.0" } as Message
}

function serializeOutboundMessage(message: Message): string {
  const { jsonrpc: _jsonrpc, ...wireMessage } = message as Message &
    Record<string, unknown>
  return `${JSON.stringify(wireMessage)}\n`
}

export class CodexAppServerJsonLineReader extends AbstractMessageReader {
  private listener: Disposable | undefined

  constructor(private readonly input: Readable) {
    super()
  }

  listen(callback: DataCallback): Disposable {
    if (this.listener !== undefined) {
      throw new Error(
        "The Codex app-server JSON-lines reader is already listening.",
      )
    }

    const lines = createInterface({
      input: this.input,
      crlfDelay: Number.POSITIVE_INFINITY,
      terminal: false,
    })
    let active = true
    const close = (notify: boolean): void => {
      if (!active) return
      active = false
      lines.off("line", onLine)
      lines.off("close", onClose)
      this.input.off("error", onError)
      if (notify) this.fireClose()
      lines.close()
    }
    const fail = (error: unknown): void => {
      this.fireError(error)
      close(true)
    }
    const onLine = (line: string): void => {
      try {
        callback(normalizeInboundMessage(line))
      } catch (error) {
        fail(error)
      }
    }
    const onClose = (): void => close(true)
    const onError = (error: Error): void => fail(error)

    lines.on("line", onLine)
    lines.once("close", onClose)
    this.input.once("error", onError)
    this.listener = {
      dispose: () => close(false),
    }
    return this.listener
  }

  override dispose(): void {
    this.listener?.dispose()
    this.listener = undefined
    super.dispose()
  }
}

function writeLine(output: Writable, line: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const settle = (error?: Error | null): void => {
      if (settled) return
      settled = true
      output.off("error", onError)
      if (error === undefined || error === null) resolve()
      else reject(error)
    }
    const onError = (error: Error): void => settle(error)
    output.once("error", onError)
    output.write(line, "utf8", settle)
  })
}

export class CodexAppServerJsonLineWriter extends AbstractMessageWriter {
  private errorCount = 0
  private pending: Promise<void> = Promise.resolve()

  constructor(
    private readonly output: Writable,
    private readonly onWritten: (message: Message) => void = () => {},
  ) {
    super()
    this.output.on("error", this.handleOutputError)
    this.output.on("close", this.handleOutputClose)
  }

  isWritable(): boolean {
    return !this.output.destroyed && !this.output.writableEnded
  }

  private readonly handleOutputError = (error: Error): void => {
    this.errorCount += 1
    this.fireError(error, undefined, this.errorCount)
  }

  private readonly handleOutputClose = (): void => this.fireClose()

  write(message: Message): Promise<void> {
    const operation = this.pending.then(async () => {
      try {
        await writeLine(this.output, serializeOutboundMessage(message))
        this.onWritten(message)
      } catch (error) {
        this.errorCount += 1
        this.fireError(error, message, this.errorCount)
        throw error
      }
    })
    this.pending = operation.catch(() => {})
    return operation
  }

  end(): void {
    void this.pending.then(() => {
      if (!this.output.writableEnded) this.output.end()
    })
  }

  override dispose(): void {
    this.output.off("error", this.handleOutputError)
    this.output.off("close", this.handleOutputClose)
    super.dispose()
  }
}
