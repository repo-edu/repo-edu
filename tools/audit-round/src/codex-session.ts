import type { Dirent } from "node:fs"
import { type FileHandle, open, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { StringDecoder } from "node:string_decoder"
import { z } from "zod"
import {
  eventSchema,
  type Feedback,
  selectionSchema,
  tokenSchema,
} from "./feedback.js"

export function codexSessionsRoot(runtime: {
  readonly sessionsRoot?: string
  readonly env?: Readonly<Record<string, string>>
}): string {
  return (
    runtime.sessionsRoot ??
    join(
      runtime.env?.CODEX_HOME ??
        process.env.CODEX_HOME ??
        join(homedir(), ".codex"),
      "sessions",
    )
  )
}

export async function findSessionFile(
  root: string,
  sessionId: string,
): Promise<string | undefined> {
  let entries: Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isFile() && entry.name.endsWith(`-${sessionId}.jsonl`))
      return path
    if (entry.isDirectory()) {
      const found = await findSessionFile(path, sessionId)
      if (found !== undefined) return found
    }
  }
  return undefined
}

export function decodeCodexUsage(
  record: unknown,
): Extract<Feedback, { type: "model" | "context" }>[] {
  const event = eventSchema.parse(record)
  if (event.type === "turn_context") {
    return [{ type: "model", selection: selectionSchema.parse(event.payload) }]
  }
  if (event.type !== "event_msg") return []
  const payload = eventSchema.parse(event.payload)
  if (payload.type !== "token_count") return []
  if (payload.info === null) return []
  const { info } = z
    .object({
      info: z.object({
        last_token_usage: z.object({ input_tokens: tokenSchema }),
        model_context_window: tokenSchema.positive(),
      }),
    })
    .parse(payload)
  return [
    {
      type: "context",
      tokens: info.last_token_usage.input_tokens,
      window: info.model_context_window,
    },
  ]
}

/** Reads only this invocation's appended records, including UTF-8 split across writes. */
export class CodexSessionReader {
  private file: FileHandle | undefined
  private offset = 0
  private tail = ""
  private readonly decoder = new StringDecoder("utf8")

  constructor(
    private readonly root: string,
    private readonly decode: (record: unknown) => Feedback[] = decodeCodexUsage,
  ) {}

  async prepareResume(sessionId: string): Promise<void> {
    const path = await findSessionFile(this.root, sessionId)
    if (path === undefined)
      throw new Error(`Cannot locate resumed Codex session ${sessionId}`)
    this.file = await open(path, "r")
    this.offset = (await this.file.stat()).size
  }

  async read(
    sessionId: string,
    observe: (feedback: Feedback) => Promise<void>,
    final = false,
  ): Promise<void> {
    if (this.file === undefined) {
      const path = await findSessionFile(this.root, sessionId)
      if (path === undefined) {
        if (final) throw new Error(`Cannot locate Codex session ${sessionId}`)
        return
      }
      this.file = await open(path, "r")
    }
    const size = (await this.file.stat()).size
    if (size < this.offset)
      throw new Error("Codex session file shrank during invocation")
    if (this.offset < size) {
      const buffer = Buffer.alloc(64 * 1024)
      while (this.offset < size) {
        const { bytesRead } = await this.file.read(
          buffer,
          0,
          Math.min(buffer.length, size - this.offset),
          this.offset,
        )
        if (bytesRead === 0)
          throw new Error("Codex session file ended before its measured size")
        this.offset += bytesRead
        this.tail += this.decoder.write(buffer.subarray(0, bytesRead))
        let newline = this.tail.indexOf("\n")
        while (newline !== -1) {
          const line = this.tail.slice(0, newline)
          this.tail = this.tail.slice(newline + 1)
          for (const feedback of this.decode(JSON.parse(line)))
            await observe(feedback)
          newline = this.tail.indexOf("\n")
        }
      }
    }
    if (final && (this.tail + this.decoder.end()).length > 0)
      throw new Error("Incomplete Codex session record")
  }

  async close(): Promise<void> {
    await this.file?.close()
  }
}
