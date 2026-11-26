import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { MoveList } from "./move-list.js"
import type { PhaseFailure, PhaseInput, PhaseResult } from "./phase.js"
import { designFilename, pickFilename, splitLabel } from "./round-paths.js"
import type { Density } from "./settings.js"
import {
  type Answer,
  answer,
  nextSplitNumber,
  saveAnswers,
  type Writer,
} from "./split-answers.js"
import type { AttemptReply } from "./split-attempt.js"
import { pickReport } from "./split-result-schema.js"

export type Moves = Extract<MoveList, { kind: "moves" }>
export type SessionAnswer<P extends "design" | "pick"> =
  | PhaseFailure
  | (PhaseResult<P> & { readonly writer: Writer })
export type SplitSessions = {
  designers: readonly {
    density: Density
    run: (hash: string) => Promise<SessionAnswer<"design">>
  }[]
  pick: (
    hash: string,
    candidates: PhaseInput<"pick">["arguments"][2],
  ) => Promise<SessionAnswer<"pick">>
}
export type Choice = {
  selected: Answer
  pick?: {
    writer: Writer
    original: number | null
    designers: readonly Answer[]
  }
}
export type TrialFailure = Exclude<AttemptReply, { outcome: "clean" }>
type Verdict = { result: "needs-plan" | "skipped"; message: string }
type SourceSnapshot = {
  readonly source: string
  readonly hash: string
  readonly size: number
}

/** Number in settings order and retain every answer that finished. */
export async function designSplit(
  snapshot: SourceSnapshot,
  folder: string,
  designers: SplitSessions["designers"],
  showReport: (text: string) => void,
): Promise<{ answers: readonly Answer[] } | PhaseFailure> {
  const { source, hash, size } = snapshot
  const label = splitLabel(source)
  const first = await nextSplitNumber(folder, label, "design")
  const results = await Promise.allSettled(
    designers.map(async (designer, index) => {
      const number = first + index
      const outcome = await designer.run(hash)
      if (outcome.status === "failed") return outcome
      try {
        return answer({ ...outcome.design, source, hash }, size, {
          ...outcome.writer,
          number,
          designer: index + 1,
          density: designer.density,
        })
      } catch (error) {
        return invalidAnswer(outcome.sessionId, error)
      }
    }),
  )
  const answers: Answer[] = []
  let failure: PhaseFailure | undefined
  for (const result of results) {
    if (result.status === "rejected")
      failure ??= {
        status: "failed",
        reason: String(result.reason),
        sessionId: null,
      }
    else if ("status" in result.value) failure ??= result.value
    else answers.push(result.value)
  }
  await saveAnswers(folder, label, answers)
  for (const { text } of answers) showReport(text)
  return failure ?? { answers }
}

export async function pickSplit(
  snapshot: SourceSnapshot,
  folder: string,
  answers: readonly Answer[],
  pickAnswer: SplitSessions["pick"],
  trials: (
    answers: readonly Answer[],
  ) => Promise<readonly (TrialFailure | null)[]>,
  showReport: (text: string) => void,
): Promise<Choice | Verdict | PhaseFailure> {
  const { source, hash } = snapshot
  const label = splitLabel(source)
  const initial = answers[0]
  const list = initial.list
  if (
    list.kind === "no-split" &&
    answers.every(
      (a) => a.list.kind === "no-split" && a.list.result === list.result,
    )
  )
    return { selected: initial }
  const attempts = await trials(answers)
  const changed = attempts.find((r) => r?.outcome === "changed")
  if (changed?.outcome === "changed")
    return { result: "skipped", message: changed.message }
  const candidates = answers.map(({ record }, i) => {
    const trial = attempts[i]
    return {
      number: record.number,
      path: join(folder, designFilename(label, record.number, record.tag)),
      refusal: trial?.outcome === "refused" ? trial.message : null,
    }
  })
  if (candidates.every((c) => c.refusal !== null))
    return {
      result: "needs-plan",
      message: candidates
        .map((c) => `Answer ${c.number}: ${c.refusal}`)
        .join("\n"),
    }
  const pick = await pickAnswer(hash, candidates)
  if (pick.status === "failed") return pick
  let selection: Awaited<ReturnType<typeof selectAnswer>>
  try {
    selection = await selectAnswer(snapshot, folder, answers, candidates, pick)
  } catch (error) {
    return invalidAnswer(pick.sessionId, error)
  }
  const reportNumber = await nextSplitNumber(folder, label, "pick")
  await writeFile(
    join(folder, pickFilename(label, reportNumber, pick.writer.tag)),
    `${selection.report}\n`,
  )
  if (selection.newAnswer)
    await saveAnswers(folder, label, [selection.selected])
  showReport(selection.report)
  if (selection.newAnswer) showReport(selection.selected.text)
  return {
    selected: selection.selected,
    pick: {
      writer: pick.writer,
      original: selection.number,
      designers: answers,
    },
  }
}

function invalidAnswer(sessionId: string, error: unknown): PhaseFailure {
  return {
    status: "failed",
    reason: error instanceof Error ? error.message : String(error),
    sessionId,
  }
}

async function selectAnswer(
  { source, hash, size }: SourceSnapshot,
  folder: string,
  answers: readonly Answer[],
  candidates: PhaseInput<"pick">["arguments"][2],
  { pick, writer }: Extract<SessionAnswer<"pick">, { status: "finished" }>,
) {
  const { number, replacement } = pick
  const report = pickReport(candidates, pick)
  if (number !== null) {
    const original = answers.find((a) => a.record.number === number)
    if (
      !original ||
      candidates.some((c) => c.number === number && c.refusal !== null)
    )
      throw new Error(`The picker selected unavailable answer ${number}`)
    if (replacement === null)
      return { report, number, selected: original, newAnswer: false }
    if (original.list.kind !== "moves")
      throw new Error(
        `The picker can only repair a move list (answer ${number})`,
      )
  }
  const selected = answer({ ...replacement, source, hash }, size, {
    ...writer,
    number: await nextSplitNumber(folder, splitLabel(source), "design"),
    designer: null,
    density: null,
  })
  return { report, number, selected, newAnswer: true }
}
