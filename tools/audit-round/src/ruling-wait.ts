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
import {
  capabilityTag,
  type RulingWinner,
  rulingWinnerSchema,
} from "./round-data.js"

/**
 * The waiting run owns a ruling's wait. While it waits it listens on one Unix
 * domain socket under the cache root and serves two requests: what is open,
 * and the answer. It checks the answer itself, because it alone holds the
 * findings still open, so the sending command only carries the document.
 */

/**
 * What the user answers on one finding: the winner of a serious contest or
 * split, or a choice on what the fix does when the reviews or the ruler leave
 * that choice to the user.
 */
export const rulingQuestionSchema = z.strictObject({
  finding: z.number().int().positive(),
  needs: z.enum(["winner", "choice"]),
})
export type RulingQuestion = z.infer<typeof rulingQuestionSchema>

/** What a waiting run asks, as the notice and the `ruling` command print it. */
export const waitingRulingSchema = z.strictObject({
  /** The plan stem or commit label the commands name the run by. */
  target: z.string().min(1),
  /** The round or step, as the run's own title names it. */
  title: z.string().min(1),
  /**
   * The ruling a fix or an implementation worker wrote; null for the questions
   * the runner asks before the fix starts, which have no ruling document.
   */
  ruling: z.string().min(1).nullable(),
  /** The round's reports the chat reads; an implementation worker has none. */
  reports: z.array(z.string().min(1)).readonly(),
  /**
   * Whose model runs the fix: the auditor's, one panel vetter's named by its tag,
   * or neither side's; null for an implementation worker.
   */
  fixerSide: z
    .union([
      z.enum(["auditor", "neither"]),
      z.strictObject({ vet: capabilityTag }),
    ])
    .nullable(),
  /** The findings the user answers, each with what it needs. */
  questions: z.array(rulingQuestionSchema).readonly(),
  /**
   * The round's panel tags, which a winner may name. Every finding of a round
   * has the same panel, so the tags appear once; an implementation worker has
   * none.
   */
  panel: z.array(capabilityTag).readonly(),
})
export type WaitingRuling = z.infer<typeof waitingRulingSchema>

/** The one answer document the chat writes and `answer` carries. */
const rulingAnswerSchema = z.strictObject({
  rulings: z.array(
    z.strictObject({
      finding: z.number().int().positive(),
      winner: rulingWinnerSchema.optional(),
      reason: z.string().optional(),
      choice: z.string().optional(),
    }),
  ),
  reply: z.string(),
})
type RulingAnswer = z.infer<typeof rulingAnswerSchema>

/**
 * An admitted answer: each named winner with its reason, each choice in the
 * user's words, and the free reply.
 */
export type RulingInput = {
  readonly rulings: readonly {
    readonly finding: number
    readonly winner: RulingWinner
    readonly reason: string
  }[]
  readonly choices: readonly {
    readonly finding: number
    readonly choice: string
  }[]
  readonly reply: string
}

/** The winner words of one waiting ruling, with its panel's own tags. */
function winnerWords(panel: readonly string[]): string {
  return `report, neither or one or more of the vetter tags ${panel.join(", ")}`
}

/** The findings of one waiting ruling that need the given answer. */
function asked(
  questions: readonly RulingQuestion[],
  needs: RulingQuestion["needs"],
): readonly number[] {
  return questions.flatMap((question) =>
    question.needs === needs ? [question.finding] : [],
  )
}

/**
 * The one check for a complete answer. Every asked finding gets its answer: a
 * winner with a one-line reason, which a choice may join when the winning side
 * leaves one open, or a choice alone, which credits no side. A vetter tag must
 * name a vetter of the round's panel. The free reply is for the session that
 * wrote the ruling: it is the whole answer when the ruling asks about no
 * finding, and it stays empty before the fix, when no session would read it.
 */
function answerRefusals(
  waiting: Pick<WaitingRuling, "ruling" | "questions" | "panel">,
  answer: RulingAnswer,
): readonly string[] {
  const { questions, panel } = waiting
  const refusals: string[] = []
  const answered = new Set<number>()
  for (const ruling of answer.rulings) {
    const { finding } = ruling
    const question = questions.find(
      (candidate) => candidate.finding === finding,
    )
    if (question === undefined) {
      refusals.push(`Finding ${finding} is not asked.`)
      continue
    }
    if (answered.has(finding)) {
      refusals.push(`Finding ${finding} is answered more than once.`)
      continue
    }
    answered.add(finding)
    if (ruling.choice !== undefined && ruling.choice.trim().length === 0)
      refusals.push(`Finding ${finding} has an empty choice.`)
    if (question.needs === "choice") {
      if (ruling.winner !== undefined || ruling.reason !== undefined)
        refusals.push(
          `Finding ${finding} needs a choice, which names no winner and takes no reason.`,
        )
      else if (ruling.choice === undefined)
        refusals.push(`Finding ${finding} needs a choice.`)
      continue
    }
    if (ruling.winner === undefined) {
      refusals.push(
        `Finding ${finding} needs a winner; use ${winnerWords(panel)}.`,
      )
      continue
    }
    if (Array.isArray(ruling.winner))
      for (const tag of ruling.winner)
        if (!panel.includes(tag))
          refusals.push(
            `Finding ${finding} names ${tag}, which is no vetter of this round; use ${winnerWords(panel)}.`,
          )
    const reason = ruling.reason?.trim() ?? ""
    if (reason.length === 0)
      refusals.push(
        `Finding ${finding} needs a one-line reason for its winner.`,
      )
    else if (/[\r\n]/.test(reason))
      refusals.push(`Finding ${finding} needs its reason on one line.`)
  }
  for (const { finding, needs } of questions)
    if (!answered.has(finding))
      refusals.push(
        needs === "winner"
          ? `Finding ${finding} has no answer; use ${winnerWords(panel)}.`
          : `Finding ${finding} has no answer; give the user's choice.`,
      )
  const replied = answer.reply.trim().length > 0
  if (!replied && questions.length === 0)
    refusals.push(
      "The reply is empty; this ruling asks about no finding, so its answer is the reply.",
    )
  if (replied && waiting.ruling === null)
    refusals.push(
      "The reply must be empty, because no session reads it before the fix; put the user's words in a finding's reason or choice.",
    )
  return refusals
}

/** Read one carried answer document, or name everything that keeps it out. */
function admitAnswer(
  waiting: Pick<WaitingRuling, "ruling" | "questions" | "panel">,
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
  const refusals = answerRefusals(waiting, parsed.data)
  if (refusals.length > 0) return { refusal: refusals.join("\n") }
  return {
    answer: {
      rulings: parsed.data.rulings.flatMap(({ finding, winner, reason }) =>
        winner === undefined
          ? []
          : [{ finding, winner, reason: (reason as string).trim() }],
      ),
      choices: parsed.data.rulings.flatMap(({ finding, choice }) =>
        choice === undefined ? [] : [{ finding, choice: choice.trim() }],
      ),
      reply: parsed.data.reply.trim(),
    },
  }
}

/** A list of finding numbers, or `none`. */
function findingList(findings: readonly number[]): string {
  return findings.length === 0 ? "none" : findings.join(", ")
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
              : ruling.fixerSide === "auditor"
                ? "the auditor's model"
                : `vetter ${ruling.fixerSide.vet}'s model`
          }.`,
        ]
  const winners = asked(ruling.questions, "winner")
  return [
    `Your ruling is needed: ${ruling.title}`,
    `Target: ${ruling.target}`,
    ...(ruling.ruling === null ? [] : [`Ruling: ${ruling.ruling}`]),
    ...(ruling.reports.length === 0
      ? []
      : ["Round reports:", ...ruling.reports.map((report) => `  ${report}`)]),
    `Findings that need a winner: ${findingList(winners)}`,
    `Findings that need a choice: ${findingList(asked(ruling.questions, "choice"))}`,
    ...(winners.length === 0
      ? []
      : [`Winner words: ${winnerWords(ruling.panel)}`]),
    ...side,
  ].join("\n")
}

/** How the chat answers, printed by `ruling` beside what is open. */
export function answerFormText(ruling: WaitingRuling): string {
  const example = {
    rulings: ruling.questions.map(({ finding, needs }) =>
      needs === "winner"
        ? {
            finding,
            winner: "report",
            reason: "One line in the user's words.",
          }
        : { finding, choice: "What the fix does, in the user's words." },
    ),
    reply:
      ruling.ruling === null
        ? ""
        : "The user's answer for the session that wrote the ruling.",
  }
  const words =
    ruling.questions.length === 0
      ? "This ruling asks about no finding, so its answer is the reply alone"
      : `Give each finding that needs a winner one winner word and a one-line reason, with report and neither as strings and vetter tags as a list, as ${JSON.stringify(ruling.panel.slice(0, 1))}; add a choice when the winning side leaves one open. Give each finding that needs a choice the choice alone.${ruling.ruling === null ? " The reply stays empty" : ""}`
  return [
    `Answer with: pnpm audit-round answer ${ruling.target} <file>`,
    `The file holds one JSON document in this form. ${words}:`,
    JSON.stringify(example),
  ].join("\n")
}

/** The answer as the round's transcript and log record it. */
export function rulingAnswerText(answer: RulingInput): string {
  return [
    ...answer.rulings.map(
      ({ finding, winner, reason }) =>
        `Finding ${finding} winner: ${Array.isArray(winner) ? winner.join(", ") : winner}. ${reason}`,
    ),
    ...answer.choices.map(
      ({ finding, choice }) => `Finding ${finding} choice: ${choice}`,
    ),
    ...(answer.reply.length === 0 ? [] : [answer.reply]),
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
        const admitted = admitAnswer(input.ruling, text)
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
 * Shows a ruling's message in a window that stays until the user closes it or
 * the signal ends the wait. It resolves once the window is gone, with null, or
 * with the reason it could not show.
 */
export type RulingDialog = (
  message: string,
  signal: AbortSignal,
) => Promise<string | null>

/**
 * The two chat commands that answer a waiting ruling, one for each app, shared
 * by the notice and the dialog. Either reaches the same wait.
 */
export function rulingCommandsText(target: string): string {
  return [
    "In a chat on the Repo Edu or plan checkout, type:",
    `Claude: /ruling ${target}`,
    `Codex: $ruling ${target}`,
  ].join("\n")
}

/** The dialog's message: the round or step, then the commands to type. */
export function rulingDialogText(ruling: WaitingRuling): string {
  return `${ruling.title}\n\n${rulingCommandsText(ruling.target)}`
}

/**
 * The macOS ruling dialog. `display dialog` draws a wider window than
 * `display alert`, so a file path in the title breaks across fewer lines. The
 * message and title travel as script arguments, so no text needs AppleScript
 * quoting.
 */
export const macRulingDialog: RulingDialog = async (message, signal) => {
  const result = await execa(
    "osascript",
    [
      "-e",
      "on run argv",
      "-e",
      'display dialog (item 1 of argv) with title (item 2 of argv) with icon caution buttons {"OK"} default button "OK"',
      "-e",
      "end run",
      message,
      "Audit round needs your ruling",
    ],
    { reject: false, cancelSignal: signal },
  )
  if (!result.failed || result.isCanceled) return null
  const stderr = result.stderr.trim()
  const reason = stderr.length > 0 ? stderr : String(result.shortMessage)
  return reason.split("\n", 1)[0] ?? reason
}
