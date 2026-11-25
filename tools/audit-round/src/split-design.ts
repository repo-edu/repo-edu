import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { MoveList } from "./move-list.js"
import { readPick } from "./move-list.js"
import type { PhaseFailure, PhaseInput } from "./phase.js"
import { designFilename, pickFilename, splitLabel } from "./round-paths.js"
import type { Density } from "./settings.js"
import {
  type Answer,
  answer,
  nextDesignNumber,
  saveAnswers,
  type Writer,
} from "./split-answers.js"
import type { AttemptReply } from "./split-attempt.js"

export type Moves = Extract<MoveList, { kind: "moves" }>
export type SessionAnswer =
  | PhaseFailure
  | { status: "finished"; sessionId: string; document: string; writer: Writer }
export type DesignSessions = {
  designers: readonly {
    density: Density
    run: (hash: string) => Promise<SessionAnswer>
  }[]
  pick: (
    hash: string,
    candidates: PhaseInput<"pick">["arguments"][2],
  ) => Promise<SessionAnswer>
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
type DesignOutcome = Choice | Verdict | PhaseFailure

/** Number in settings order, retain every finished answer and judge only after every designer ends. */
export async function designSplit(
  source: string,
  hash: string,
  folder: string,
  sessions: DesignSessions,
  trials: (
    answers: readonly Answer[],
  ) => Promise<readonly (TrialFailure | null)[]>,
): Promise<DesignOutcome> {
  const label = splitLabel(source)
  const first = await nextDesignNumber(folder, label)
  const results = await Promise.allSettled(
    sessions.designers.map(async (designer, index) => {
      const number = first + index
      const outcome = await designer.run(hash)
      if (outcome.status === "failed") return outcome
      try {
        const saved = answer(
          outcome.document.trimEnd() + "\n",
          {
            ...outcome.writer,
            number,
            designer: index + 1,
            density: designer.density,
          },
          source,
        )
        if (saved.list.hash !== hash)
          throw new Error(`Answer ${number} names the wrong source hash`)
        return saved
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
  if (failure) return failure
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
  const pick = await sessions.pick(hash, candidates)
  if (pick.status === "failed") return pick
  let selection: ReturnType<typeof selectAnswer>
  try {
    selection = selectAnswer(source, hash, answers, candidates, pick)
  } catch (error) {
    return invalidAnswer(pick.sessionId, error)
  }
  await writeFile(
    join(folder, pickFilename(label, first, pick.writer.tag)),
    selection.report + "\n",
  )
  if (selection.newAnswer)
    await saveAnswers(folder, label, [selection.selected])
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

function selectAnswer(
  source: string,
  hash: string,
  answers: readonly Answer[],
  candidates: PhaseInput<"pick">["arguments"][2],
  pick: Extract<SessionAnswer, { status: "finished" }>,
) {
  const { report, number, document } = readPick(pick.document)
  const original = answers.find((a) => a.record.number === number)
  if (
    number !== null &&
    (!original ||
      candidates.some((c) => c.number === number && c.refusal !== null))
  )
    throw new Error(`The picker selected unavailable answer ${number}`)
  let selected = original
  if (document !== null) {
    selected = answer(
      document,
      {
        ...pick.writer,
        number: answers[answers.length - 1].record.number + 1,
        designer: null,
        density: null,
      },
      source,
    )
    if (
      selected.list.hash !== hash ||
      (number === null
        ? selected.list.kind !== "no-split"
        : original?.list.kind !== "moves" || selected.list.kind !== "moves")
    )
      throw new Error(
        "The appended document must repair the named list or give the picker's own no-split answer",
      )
  }
  if (!selected) throw new Error("The picker gave no answer")
  return { report, number, selected, newAnswer: document !== null }
}
