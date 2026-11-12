import { createInterface } from "node:readline"
import type { Readable, Writable } from "node:stream"
import type { RulingWinner } from "./round-data.js"

export type RulingInput = {
  readonly rulings: readonly {
    readonly finding: number
    readonly winner: RulingWinner
    readonly reason: string
  }[]
  readonly reply: string
}

const winners = new Set<RulingWinner>(["vet", "auditor", "neither"])

/** Ask each serious contest before collecting the free reply for the fix. */
export async function readRulingInput(
  contests: readonly number[],
  input: Readable & { readonly isTTY?: boolean } = process.stdin,
  output: Writable = process.stdout,
  signal?: AbortSignal,
): Promise<RulingInput | null> {
  signal?.throwIfAborted()
  if (!input.isTTY) return null
  return new Promise((resolve, reject) => {
    const reader = createInterface({ input, output, terminal: true })
    const rulings: {
      finding: number
      winner: RulingWinner
      reason: string
    }[] = []
    const reply: string[] = []
    let contestIndex = 0
    let pendingWinner: RulingWinner | null = null
    let collectingReply = contests.length === 0
    const unresolved = () => contests.length - rulings.length
    const stop = () => reader.close()
    const prompt = () => {
      if (collectingReply) {
        reader.setPrompt("Reply to the fix: ")
      } else if (pendingWinner === null) {
        reader.setPrompt(
          `Finding ${contests[contestIndex]} winner (vet, auditor, neither or not yet): `,
        )
      } else {
        reader.setPrompt(`Finding ${contests[contestIndex]} reason: `)
      }
      reader.prompt()
    }
    const nextContest = () => {
      contestIndex += 1
      if (contestIndex === contests.length) collectingReply = true
      prompt()
    }
    const line = (text: string) => {
      const value = text.trim()
      if (collectingReply) {
        if (value.length === 0) {
          const emptyAllowed = contests.length > 0 && unresolved() === 0
          if (reply.length === 0 && !emptyAllowed) {
            if (unresolved() > 0)
              output.write(
                "A reply is required while a contest has no winner.\n",
              )
            prompt()
            return
          }
          resolve({ rulings, reply: reply.join("\n").trim() })
          reader.close()
          return
        }
        reply.push(text)
        prompt()
        return
      }
      if (pendingWinner === null) {
        if (value === "not yet") {
          nextContest()
          return
        }
        if (!winners.has(value as RulingWinner)) {
          output.write("Enter vet, auditor, neither or not yet.\n")
          prompt()
          return
        }
        pendingWinner = value as RulingWinner
        prompt()
        return
      }
      if (value.length === 0) {
        output.write("A winner needs a one-line reason.\n")
        prompt()
        return
      }
      rulings.push({
        finding: contests[contestIndex] as number,
        winner: pendingWinner,
        reason: value,
      })
      pendingWinner = null
      nextContest()
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
    prompt()
  })
}

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
