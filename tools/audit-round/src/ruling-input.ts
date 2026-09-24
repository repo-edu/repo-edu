import { createInterface } from "node:readline"
import type { Readable, Writable } from "node:stream"

/** The runner owns input; an unfinished reply never starts assistant work. */
export async function readRulingReply(
  input: Readable & { readonly isTTY?: boolean } = process.stdin,
  output: Writable = process.stdout,
  signal?: AbortSignal,
): Promise<string | null> {
  signal?.throwIfAborted()
  if (!input.isTTY) return null
  return new Promise((resolve, reject) => {
    const reader = createInterface({ input, output, terminal: true })
    const lines: string[] = []
    const stop = () => reader.close()
    const line = (text: string) => {
      if (text.trim().length === 0 && lines.length > 0) {
        resolve(lines.join("\n").trim())
        reader.close()
        return
      }
      if (text.trim().length > 0 || lines.length > 0) lines.push(text)
      reader.prompt()
    }
    reader.on("line", line)
    reader.on("SIGINT", stop)
    reader.once("error", (error) => {
      reject(error)
      reader.close()
    })
    reader.once("close", () => {
      signal?.removeEventListener("abort", stop)
      reader.off("line", line)
      reader.off("SIGINT", stop)
      resolve(null)
    })
    signal?.addEventListener("abort", stop, { once: true })
    reader.setPrompt("> ")
    reader.prompt()
  })
}
