import { createHash } from "node:crypto"
import { mkdir, readdir, rm } from "node:fs/promises"
import {
  createServer,
  type IncomingMessage,
  request,
  type ServerResponse,
} from "node:http"
import { join } from "node:path"
import { execa } from "execa"
import { z } from "zod"
import { type CliRuntime, cliCommand } from "./cli-process.js"
import { type RulingWinner, rulingWinnerSchema } from "./round-data.js"

/**
 * The waiting run owns a ruling's wait. While it waits it listens on one Unix
 * domain socket under the cache root and serves two requests: what is open,
 * and the answer. It checks the answer itself, because it alone holds the
 * findings still open, so the sending command only carries the document.
 */

/** What a waiting run asks, as the notice and the `ruling` command print it. */
export const waitingRulingSchema = z.strictObject({
  /** The plan stem or commit label the commands name the run by. */
  target: z.string().min(1),
  /** The round or step, as the run's own title names it. */
  title: z.string().min(1),
  ruling: z.string().min(1),
  /** The checkout the desktop app opens on. */
  folder: z.string().min(1),
  /** Whose model runs the fix; null for an implementation worker. */
  fixerSide: z.enum(["auditor", "vet", "neither"]).nullable(),
  /** The findings that still need the user's winner. */
  findings: z.array(z.number().int().positive()).readonly(),
})
export type WaitingRuling = z.infer<typeof waitingRulingSchema>

/** The runner's one list of winner words, plus the word that leaves a finding open. */
const answerWinner = z.union([rulingWinnerSchema, z.literal("not yet")])

/** The one answer document the chat writes and `answer` carries. */
const rulingAnswerSchema = z.strictObject({
  rulings: z.array(
    z.strictObject({
      finding: z.number().int().positive(),
      winner: answerWinner,
      reason: z.string().optional(),
    }),
  ),
  reply: z.string(),
})
type RulingAnswer = z.infer<typeof rulingAnswerSchema>

/** An admitted answer: each named winner with its reason, and the free reply. */
export type RulingInput = {
  readonly rulings: readonly {
    readonly finding: number
    readonly winner: RulingWinner
    readonly reason: string
  }[]
  readonly reply: string
}

const winnerWords = "report, neither, a list of vet tags or not yet"

/**
 * The one check for a complete answer. A winner needs a one-line reason, `not
 * yet` leaves its finding open, and the free reply may be empty only when every
 * open finding has a winner.
 */
function answerRefusals(
  findings: readonly number[],
  answer: RulingAnswer,
): readonly string[] {
  const refusals: string[] = []
  const answered = new Set<number>()
  for (const ruling of answer.rulings) {
    const { finding } = ruling
    if (!findings.includes(finding)) {
      refusals.push(`Finding ${finding} does not need a winner.`)
      continue
    }
    if (answered.has(finding)) {
      refusals.push(`Finding ${finding} is answered more than once.`)
      continue
    }
    answered.add(finding)
    const reason = ruling.reason?.trim() ?? ""
    if (ruling.winner === "not yet") {
      if (reason.length > 0)
        refusals.push(
          `Finding ${finding} is left open with not yet, so it takes no reason; put the question in the reply.`,
        )
    } else if (reason.length === 0)
      refusals.push(
        `Finding ${finding} needs a one-line reason for its winner.`,
      )
    else if (/[\r\n]/.test(reason))
      refusals.push(`Finding ${finding} needs its reason on one line.`)
  }
  for (const finding of findings)
    if (!answered.has(finding))
      refusals.push(`Finding ${finding} has no answer; use ${winnerWords}.`)
  const decided = answer.rulings.every((ruling) => ruling.winner !== "not yet")
  if (answer.reply.trim().length === 0 && (findings.length === 0 || !decided))
    refusals.push(
      findings.length === 0
        ? "The reply is empty; this ruling has no finding to decide, so its answer is the reply."
        : "The reply is empty; it may be empty only when every finding has a winner.",
    )
  return refusals
}

/** Read one carried answer document, or name everything that keeps it out. */
function admitAnswer(
  findings: readonly number[],
  text: string,
): { readonly answer: RulingInput } | { readonly refusal: string } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return {
      refusal: `The answer is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  const parsed = rulingAnswerSchema.safeParse(json)
  if (!parsed.success)
    return {
      refusal: `The answer does not have the answer form:\n${z.prettifyError(parsed.error)}`,
    }
  const refusals = answerRefusals(findings, parsed.data)
  if (refusals.length > 0) return { refusal: refusals.join("\n") }
  return {
    answer: {
      rulings: parsed.data.rulings.flatMap(({ finding, winner, reason }) =>
        winner === "not yet"
          ? []
          : [{ finding, winner, reason: (reason as string).trim() }],
      ),
      reply: parsed.data.reply.trim(),
    },
  }
}

/** The text a waiting ruling shows, shared by the notice and `ruling`. */
export function waitingRulingText(ruling: WaitingRuling): string {
  const side =
    ruling.fixerSide === null
      ? []
      : [
          `The fix runs on ${
            ruling.fixerSide === "neither"
              ? "neither side's model"
              : `the ${ruling.fixerSide}'s model`
          }.`,
        ]
  return [
    `Your ruling is needed: ${ruling.title}`,
    `Target: ${ruling.target}`,
    `Ruling: ${ruling.ruling}`,
    `Findings that need a winner: ${ruling.findings.length === 0 ? "none" : ruling.findings.join(", ")}`,
    ...side,
  ].join("\n")
}

/** How the chat answers, printed by `ruling` beside what is open. */
export function answerFormText(ruling: WaitingRuling): string {
  const example = {
    rulings: ruling.findings.map((finding) => ({
      finding,
      winner: "report",
      reason: "One line in the user's words.",
    })),
    reply: "Free text for the fix, or empty once every finding has a winner.",
  }
  return [
    `Answer with: pnpm audit-round answer ${ruling.target} <file>`,
    `The file holds one JSON document in this form, with winners ${winnerWords}; not yet takes no reason:`,
    JSON.stringify(example),
  ].join("\n")
}

/** Every waiting run's socket sits in this one folder under the cache root. */
function socketFolder(cacheRoot: string): string {
  return join(cacheRoot, "rulings")
}

/**
 * A short name derived from the target, because a socket path is limited to
 * 103 bytes on macOS and 107 on Linux whatever the target's length.
 */
export function rulingSocketPath(cacheRoot: string, target: string): string {
  const name = createHash("sha256").update(target).digest("hex").slice(0, 16)
  return join(socketFolder(cacheRoot), `${name}.sock`)
}

function readBody(message: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    message.on("data", (chunk: Buffer) => chunks.push(chunk))
    message.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    message.once("error", reject)
  })
}

function reply(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" })
  response.end(text)
}

/**
 * Listen for one ruling's answer. The returned promise settles once the socket
 * listens; its `answer` settles with the admitted answer, or null when the
 * signal ends the wait. Any file left at the socket path is removed first,
 * because a run that was killed never closes its server and its file would
 * block every later wait on the target.
 */
export async function listenForRuling(input: {
  readonly cacheRoot: string
  readonly ruling: WaitingRuling
  readonly signal?: AbortSignal
}): Promise<{ readonly answer: Promise<RulingInput | null> }> {
  input.signal?.throwIfAborted()
  const path = rulingSocketPath(input.cacheRoot, input.ruling.target)
  await mkdir(socketFolder(input.cacheRoot), { recursive: true })
  await rm(path, { force: true })
  let settle: (answer: RulingInput | null) => void = () => {}
  const answer = new Promise<RulingInput | null>((resolve) => {
    settle = resolve
  })
  // Set once an answer is accepted or the wait ends, so no second answer lands.
  let answered = false
  const server = createServer((message, response) => {
    void (async () => {
      if (message.method === "GET" && message.url === "/ruling") {
        reply(response, 200, JSON.stringify(input.ruling))
        return
      }
      if (message.method === "POST" && message.url === "/answer") {
        const text = await readBody(message)
        if (answered) {
          reply(response, 409, "Refused: this ruling already has its answer.")
          return
        }
        const admitted = admitAnswer(input.ruling.findings, text)
        if ("refusal" in admitted) {
          reply(response, 422, `Refused: ${admitted.refusal}`)
          return
        }
        reply(
          response,
          200,
          `Accepted: the run resumes ${input.ruling.title} with this answer.`,
        )
        answered = true
        response.once("close", () => finish(admitted.answer))
        return
      }
      reply(
        response,
        404,
        "The waiting run serves GET /ruling and POST /answer.",
      )
    })().catch((error: unknown) => {
      reply(
        response,
        500,
        `The waiting run could not read the request: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  })
  const abort = () => {
    if (answered) return
    answered = true
    finish(null)
  }
  const finish = (value: RulingInput | null) => {
    input.signal?.removeEventListener("abort", abort)
    // Closing removes the socket file, so the commands no longer find the run.
    server.close(() => settle(value))
    server.closeAllConnections()
  }
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(path, () => {
      server.off("error", reject)
      resolve()
    })
  })
  input.signal?.addEventListener("abort", abort, { once: true })
  if (input.signal?.aborted === true) abort()
  return { answer }
}

type Exchange = { readonly status: number; readonly text: string }

/** One request to a waiting run; null when no run listens on the socket. */
function exchange(
  socketPath: string,
  method: "GET" | "POST",
  path: string,
  body?: string,
): Promise<Exchange | null> {
  return new Promise((resolve, reject) => {
    // One connection per request, so no kept-alive socket outlives the wait.
    const sent = request(
      { socketPath, method, path, agent: false },
      (response) => {
        readBody(response).then(
          (text) => resolve({ status: response.statusCode ?? 0, text }),
          reject,
        )
      },
    )
    sent.once("error", (error: NodeJS.ErrnoException) => {
      // A dead run's file refuses the connection, so it counts as no run.
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT")
        resolve(null)
      else reject(error)
    })
    sent.end(body)
  })
}

/** Every run that waits for a ruling now, found through the socket folder. */
async function waitingRulings(
  cacheRoot: string,
): Promise<
  readonly { readonly socket: string; readonly ruling: WaitingRuling }[]
> {
  let names: string[]
  try {
    names = await readdir(socketFolder(cacheRoot))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  const found = await Promise.all(
    names
      .filter((name) => name.endsWith(".sock"))
      .sort()
      .map(async (name) => {
        const socket = join(socketFolder(cacheRoot), name)
        const response = await exchange(socket, "GET", "/ruling")
        if (response === null) return []
        return [
          {
            socket,
            ruling: waitingRulingSchema.parse(JSON.parse(response.text)),
          },
        ]
      }),
  )
  return found.flat()
}

/**
 * The one waiting run a command addresses: the named target's, or the only
 * run that waits when none is named.
 */
export async function waitingRun(
  cacheRoot: string,
  target: string | undefined,
): Promise<{ readonly socket: string; readonly ruling: WaitingRuling }> {
  if (target !== undefined) {
    const socket = rulingSocketPath(cacheRoot, target)
    const response = await exchange(socket, "GET", "/ruling")
    if (response === null)
      throw new Error(`No run waits for a ruling on ${target}.`)
    return {
      socket,
      ruling: waitingRulingSchema.parse(JSON.parse(response.text)),
    }
  }
  const runs = await waitingRulings(cacheRoot)
  const only = runs[0]
  if (only === undefined) throw new Error("No run waits for a ruling.")
  if (runs.length > 1)
    throw new Error(
      `Several runs wait for a ruling; name one of: ${runs.map(({ ruling }) => ruling.target).join(", ")}.`,
    )
  return only
}

/** Carry one answer document to the waiting run and return its reply. */
export async function sendRulingAnswer(
  socket: string,
  target: string,
  document: string,
): Promise<{ readonly accepted: boolean; readonly text: string }> {
  const response = await exchange(socket, "POST", "/answer", document)
  if (response === null)
    throw new Error(`No run waits for a ruling on ${target}.`)
  return { accepted: response.status === 200, text: response.text }
}

/**
 * Open the Claude desktop app on the folder of the work. The app takes no
 * prompt, so the user types `/ruling` there. A failed start, as on Linux where
 * the option does not exist, is reported and the wait goes on, because the
 * notice already holds everything the user needs.
 */
export async function openDesktop(
  folder: string,
  runtime: CliRuntime,
  failed: (reason: string) => void,
): Promise<void> {
  const invocation = cliCommand(runtime, "claude", ["--desktop"])
  const result = await execa(invocation.file, invocation.args, {
    cwd: folder,
    env: runtime.env,
    stdin: "ignore",
    stdout: "ignore",
    reject: false,
    cancelSignal: runtime.signal,
  })
  if (!result.failed || result.isCanceled) return
  const stderr = String(result.stderr ?? "").trim()
  const reason = stderr.length > 0 ? stderr : String(result.shortMessage)
  failed(reason.split("\n", 1)[0] ?? reason)
}
