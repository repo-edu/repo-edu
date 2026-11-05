import { mean } from "simple-statistics"
import type { ExecutionContext } from "./context.js"
import {
  auditorFloor,
  clearlyPreferred,
  clearlyPreferredMeasures,
  coderFloor,
} from "./model-comparison.js"
import {
  type AuditorRow,
  type AuditorSample,
  type CoderRow,
  type DisprovedEvidence,
  type FindingCounts,
  type ModelIdentity,
  modelKey,
  modelText,
  readModelEvidence,
  type WorkClass,
} from "./model-evidence.js"
import type { RoundSettings } from "./settings.js"

function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ")
}

function numberText(value: number): string {
  return value.toFixed(1)
}

/** Yields are small means, so one decimal hides the differences the sort rests on. */
function yieldText(value: number): string {
  return value.toFixed(2)
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`
}

/** A note line for a row below the comparison floor, or null when it is admitted. */
function shortageNote(
  identity: ModelIdentity,
  sampleCount: number,
  floor: number,
  unit: string,
  measure: string,
): string | null {
  const missing = floor - sampleCount
  if (missing <= 0) return null
  return `${modelText(identity)} needs ${plural(missing, `more ${unit}`)} before ${measure} is compared.`
}

/** The verdict paragraph followed by the notes as a bullet list, when any. */
function readingLines(verdict: string, notes: readonly string[]): string[] {
  return notes.length === 0
    ? [verdict]
    : [verdict, "", ...notes.map((note) => `- ${note}`)]
}

function sortedRows<Row extends { readonly identity: ModelIdentity }>(
  rows: ReadonlyMap<string, Row>,
): Array<readonly [string, Row]> {
  return [...rows].sort(([, first], [, second]) =>
    modelText(first.identity).localeCompare(modelText(second.identity)),
  )
}

/** Rows ordered by descending score, lexicographic over its parts, then by name. */
function leaderFirst<Row extends { readonly identity: ModelIdentity }>(
  rows: readonly Row[],
  score: (row: Row) => readonly number[],
): Row[] {
  return [...rows].sort((first, second) => {
    const firstScore = score(first)
    const secondScore = score(second)
    for (let index = 0; index < firstScore.length; index += 1)
      if (firstScore[index] !== secondScore[index])
        return secondScore[index] - firstScore[index]
    return modelText(first.identity).localeCompare(modelText(second.identity))
  })
}

function meanOrNull(values: readonly number[]): number | null {
  return values.length === 0 ? null : mean(values)
}

function cell(value: number | null): string {
  return value === null ? "—" : numberText(value)
}

function yieldCell(value: number | null): string {
  return value === null ? "—" : yieldText(value)
}

function auditorSamples(
  row: AuditorRow,
  workClass: WorkClass,
): AuditorSample[] {
  return row.samples.filter((sample) => sample.workClass === workClass)
}

/**
 * Rows with a complete round in the class. A model whose rounds all fall in
 * the other class has nothing to show here, so it stays out of this class's
 * reading and table rather than printing a zero row and a shortage bullet.
 */
function classRows(
  rows: ReadonlyMap<string, AuditorRow>,
  workClass: WorkClass,
): ReadonlyMap<string, AuditorRow> {
  return new Map(
    [...rows].filter(([, row]) => auditorSamples(row, workClass).length > 0),
  )
}

/**
 * Rows with an admitted plan. A model known only through excluded plans is
 * named in the excluded-plans section, which already carries that evidence.
 */
function admittedCoders(
  rows: ReadonlyMap<string, CoderRow>,
): ReadonlyMap<string, CoderRow> {
  return new Map([...rows].filter(([, row]) => row.yieldSamples.length > 0))
}

function auditorRecommendation(
  rows: ReadonlyMap<string, AuditorRow>,
  workClass: WorkClass,
): string | null {
  const eligible = sortedRows(rows).filter(([, row]) =>
    (["planning", "implementation"] as const).every(
      (candidateClass) =>
        auditorSamples(row, candidateClass).length >= auditorFloor,
    ),
  )
  if (eligible.length < 2) return null
  const winners = eligible.filter(([candidateKey, candidate]) =>
    eligible.every(
      ([otherKey, other]) =>
        candidateKey === otherKey ||
        (clearlyPreferred(
          auditorSamples(candidate, workClass),
          auditorSamples(other, workClass),
          true,
        ) &&
          !clearlyPreferred(
            auditorSamples(
              other,
              workClass === "planning" ? "implementation" : "planning",
            ),
            auditorSamples(
              candidate,
              workClass === "planning" ? "implementation" : "planning",
            ),
            true,
          )),
    ),
  )
  return winners.length === 1 ? winners[0][0] : null
}

/** Whether an `auditors` entry runs the row's model and effort. */
function listedAuditor(
  identity: ModelIdentity,
  settings: RoundSettings,
): boolean {
  return settings.auditors.some(
    (auditor) =>
      identity.effort === auditor.effort &&
      (identity.model === auditor.model ||
        identity.model.includes(auditor.model)),
  )
}

function auditorReading(
  rows: ReadonlyMap<string, AuditorRow>,
  workClass: WorkClass,
  settings: RoundSettings,
): string[] {
  const entries = sortedRows(rows)
  if (entries.length === 0)
    return [`No ${workClass} auditor records are available.`]
  const notes = entries.flatMap(([, row]) => {
    const note = shortageNote(
      row.identity,
      auditorSamples(row, workClass).length,
      auditorFloor,
      "example",
      "it",
    )
    return note === null ? [] : [note]
  })
  const recommendation = auditorRecommendation(rows, workClass)
  if (recommendation === null)
    return readingLines(
      `The records do not separate one ${workClass} auditor clearly.`,
      notes,
    )
  const identity = rows.get(recommendation)?.identity ?? entries[0][1].identity
  return readingLines(
    `The records clearly support running ${modelText(identity)} for ${workClass} audits.`,
    listedAuditor(identity, settings)
      ? notes
      : [
          `${modelText(identity)} is not in the current auditors list.`,
          ...notes,
        ],
  )
}

function addCounts(first: FindingCounts, second: FindingCounts): FindingCounts {
  return {
    kept: first.kept + second.kept,
    dropped: first.dropped + second.dropped,
    downgraded: first.downgraded + second.downgraded,
    disproved: first.disproved + second.disproved,
  }
}

function auditorCounts(row: AuditorRow, workClass: WorkClass): FindingCounts {
  const counts = auditorSamples(row, workClass).reduce(
    (total, sample) => addCounts(total, sample.counts),
    { kept: 0, dropped: 0, downgraded: 0, disproved: 0 },
  )
  return {
    ...counts,
    disproved: counts.disproved + row.detachedDisproved[workClass],
  }
}

function wrongClaims(counts: FindingCounts): string {
  const total =
    counts.kept + counts.dropped + counts.downgraded + counts.disproved
  if (total === 0) return "0%"
  return `${Math.round(((counts.dropped + counts.downgraded + counts.disproved) / total) * 100)}%`
}

function auditorTable(
  rows: ReadonlyMap<string, AuditorRow>,
  workClass: WorkClass,
): string[] {
  const readings = [...rows.values()].map((row) => {
    const samples = auditorSamples(row, workClass)
    return {
      identity: row.identity,
      rounds: samples.length,
      counts: auditorCounts(row, workClass),
      yield: meanOrNull(samples.map((sample) => sample.yield)),
      minutes: meanOrNull(samples.map((sample) => sample.minutes)),
    }
  })
  return [
    "| Model | Rounds | A/B kept | A/B per round | Dropped | Downgraded | Disproved | Wrong claims | Minutes per round |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...leaderFirst(readings, (reading) => [
      reading.yield ?? Number.NEGATIVE_INFINITY,
      -(reading.minutes ?? Number.POSITIVE_INFINITY),
    ]).map(
      (reading) =>
        `| ${escapeCell(modelText(reading.identity))} | ${reading.rounds} | ${reading.counts.kept} | ${yieldCell(reading.yield)} | ${reading.counts.dropped} | ${reading.counts.downgraded} | ${reading.counts.disproved} | ${wrongClaims(reading.counts)} | ${cell(reading.minutes)} |`,
    ),
  ]
}

function coderRecommendation(
  rows: ReadonlyMap<string, CoderRow>,
): string | null {
  const ranked = sortedRows(rows).filter(
    ([, row]) =>
      row.yieldSamples.length >= coderFloor &&
      row.timeSamples.length >= coderFloor,
  )
  if (ranked.length < 2) return null
  const winners = ranked.filter(([candidateKey, candidate]) =>
    ranked.every(
      ([otherKey, other]) =>
        candidateKey === otherKey ||
        clearlyPreferredMeasures(
          candidate.yieldSamples,
          other.yieldSamples,
          candidate.timeSamples,
          other.timeSamples,
          false,
        ),
    ),
  )
  return winners.length === 1 ? winners[0][0] : null
}

function coderReading(
  rows: ReadonlyMap<string, CoderRow>,
  settings: RoundSettings,
): string[] {
  const entries = sortedRows(rows)
  if (entries.length === 0) return ["No coder records are available."]
  const notes = entries.flatMap(([, row]) =>
    [
      shortageNote(
        row.identity,
        row.yieldSamples.length,
        coderFloor,
        "plan",
        "its yield",
      ),
      shortageNote(
        row.identity,
        row.timeSamples.length,
        coderFloor,
        "timed plan",
        "its time",
      ),
    ].filter((note): note is string => note !== null),
  )
  const recommendation = coderRecommendation(rows)
  if (recommendation === null)
    return readingLines("The records do not separate one coder clearly.", notes)
  const identity = rows.get(recommendation)?.identity ?? entries[0][1].identity
  const current = new Set(settings.coders.map((coder) => modelKey(coder)))
  return readingLines(
    `The records clearly support running ${modelText(identity)}.`,
    current.has(recommendation)
      ? notes
      : [`${modelText(identity)} is not in the current coder list.`, ...notes],
  )
}

function coderTable(rows: ReadonlyMap<string, CoderRow>): string[] {
  const readings = [...rows.values()].map((row) => {
    const timedSteps = row.timeSamples.reduce(
      (total, sample) => total + sample.steps,
      0,
    )
    const totalMinutes = row.timeSamples.reduce(
      (total, sample) => total + sample.minutes * sample.steps,
      0,
    )
    return {
      identity: row.identity,
      plans: row.yieldSamples.length,
      timedPlans: row.timeSamples.length,
      steps: row.yieldSamples.reduce(
        (total, sample) => total + sample.steps,
        0,
      ),
      kept: row.yieldSamples.reduce((total, sample) => total + sample.kept, 0),
      yield: meanOrNull(row.yieldSamples.map((sample) => sample.yield)),
      minutes: timedSteps === 0 ? null : totalMinutes / timedSteps,
    }
  })
  return [
    "| Model | Plans | Timed plans | Steps | A/B kept | A/B per step | Minutes per step |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...leaderFirst(readings, (reading) => [
      -(reading.yield ?? Number.POSITIVE_INFINITY),
      -(reading.minutes ?? Number.POSITIVE_INFINITY),
    ]).map(
      (reading) =>
        `| ${escapeCell(modelText(reading.identity))} | ${reading.plans} | ${reading.timedPlans} | ${reading.steps} | ${reading.kept} | ${yieldCell(reading.yield)} | ${cell(reading.minutes)} |`,
    ),
  ]
}

function disprovedSection(entries: readonly DisprovedEvidence[]): string[] {
  const lines = ["## Disproved after the round", ""]
  if (entries.length === 0)
    return [...lines, "No findings were disproved after a round."]
  const groups = new Map<string, DisprovedEvidence[]>()
  for (const entry of entries) {
    const key = modelText(entry.auditor)
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }
  for (const [auditor, group] of [...groups].sort(([first], [second]) =>
    first.localeCompare(second),
  )) {
    if (lines.length > 2) lines.push("")
    lines.push(
      `### ${auditor}`,
      "",
      "| Date | Plan and round | Finding | Tier | Vet | Reason |",
      "| --- | --- | --- | --- | --- | --- |",
    )
    for (const entry of group.sort(
      (first, second) =>
        second.date.localeCompare(first.date) ||
        first.stem.localeCompare(second.stem),
    ))
      if (entry.kind === "detached")
        lines.push(
          `| ${entry.date} | ${escapeCell(`${entry.stem}; no retained round data holds this finding`)} | — | — | — | ${escapeCell(entry.reason)} |`,
        )
      else
        lines.push(
          `| ${entry.date} | ${escapeCell(`${entry.stem}; ${entry.target} round ${entry.round}`)} | ${escapeCell(`#${entry.finding} ${entry.title}`)} | ${entry.tier} | ${escapeCell(`${entry.vet === null ? "no recorded vet" : modelText(entry.vet)}; ${entry.vetVerdict ?? "no verdict"}`)} | ${escapeCell(entry.reason)} |`,
        )
  }
  return lines
}

function titleCase(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

function excludedSection(rows: ReadonlyMap<string, CoderRow>): string[] {
  const lines = ["## Excluded plans", ""]
  const reasons = new Map<string, Map<string, Set<string>>>()
  for (const [, row] of sortedRows(rows))
    for (const [stem, reason] of row.excluded) {
      const plans = reasons.get(reason) ?? new Map<string, Set<string>>()
      const models = plans.get(stem) ?? new Set<string>()
      models.add(modelText(row.identity))
      plans.set(stem, models)
      reasons.set(reason, plans)
    }
  if (reasons.size === 0) return [...lines, "No plans are excluded."]
  let first = true
  for (const [reason, plans] of [...reasons].sort(([first], [second]) =>
    first.localeCompare(second),
  )) {
    if (!first) lines.push("")
    first = false
    lines.push(`### ${titleCase(reason)}`, "")
    for (const [stem, models] of [...plans].sort(([first], [second]) =>
      first.localeCompare(second),
    ))
      lines.push(`- ${stem}: ${[...models].sort().join(", ")}`)
  }
  return lines
}

/** Read every retained model record and render the auditor and coder results. */
export async function modelsReport(
  context: ExecutionContext,
  settings: RoundSettings,
): Promise<string> {
  const evidence = await readModelEvidence(context)
  const planning = classRows(evidence.auditors, "planning")
  const implementation = classRows(evidence.auditors, "implementation")
  const coders = admittedCoders(evidence.coders)
  const lines = [
    "# Model read-out",
    "",
    "## Planning auditors",
    "",
    ...auditorReading(planning, "planning", settings),
    "",
    ...auditorTable(planning, "planning"),
    "",
    "## Implementation auditors",
    "",
    ...auditorReading(implementation, "implementation", settings),
    "",
    ...auditorTable(implementation, "implementation"),
    "",
    "Rows sort by A/B per round, the mean accepted A and B findings per round after later disprovals, then by time. A/B kept is their total. Dropped and downgraded record the round's result. Disproved records the user's later ruling. Wrong claims is dropped, downgraded and disproved as a percentage of all four counts. Auditor time includes audit and rebuttal only.",
    "",
    "## Coders",
    "",
    ...coderReading(coders, settings),
    "",
    ...coderTable(coders),
    "",
    "Rows sort by A/B per step, the mean over plans of accepted findings per step, fewest first, then by time. One coder example is one closed plan with a readable model record for every hosted step share, one recorded coder and a complete whole-plan implementation audit after the final step. A ready assignment, when present, must name that coder's assistant and effort; the assignment may be a family alias, so the records name the release. A step without recorded active time uses the span from the ready marker or previous step to its own later share commit. Time adds step time and implementation-round fix time. Planning-round fixes do not enter coder evidence.",
    "",
    ...disprovedSection(evidence.disproved),
    "",
    ...excludedSection(evidence.coders),
  ]
  return `${lines.join("\n")}\n`
}
