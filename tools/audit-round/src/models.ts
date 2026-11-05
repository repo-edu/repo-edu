import { mean } from "simple-statistics"
import type { ExecutionContext } from "./context.js"
import {
  auditorFloor,
  clearlyPreferred,
  clearlyPreferredMeasures,
  coderFloor,
  speedWords,
  yieldWords,
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

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`
}

function shortageClause(
  identity: ModelIdentity,
  sampleCount: number,
  floor: number,
  context: string,
): string | null {
  const missing = floor - sampleCount
  if (missing <= 0) return null
  return `${context}, ${modelText(identity)} needs ${plural(missing, "more example")} before it is compared`
}

function joinedSentence(clauses: readonly string[]): string {
  const joined = clauses.join("; ")
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`
}

function sortedRows<Row extends { readonly identity: ModelIdentity }>(
  rows: ReadonlyMap<string, Row>,
): Array<readonly [string, Row]> {
  return [...rows].sort(([, first], [, second]) =>
    modelText(first.identity).localeCompare(modelText(second.identity)),
  )
}

type Reading = { readonly identity: ModelIdentity }

/** Rows ordered by descending score, lexicographic over its parts, then by name. */
function leaderFirst<Row extends Reading>(
  readings: readonly Row[],
  score: (reading: Row) => readonly number[],
): Row[] {
  return [...readings].sort((first, second) => {
    const firstScore = score(first)
    const secondScore = score(second)
    for (let index = 0; index < firstScore.length; index += 1)
      if (firstScore[index] !== secondScore[index])
        return secondScore[index] - firstScore[index]
    return modelText(first.identity).localeCompare(modelText(second.identity))
  })
}

function speedClause(minutes: number, leaderMinutes: number): string {
  const reading = speedWords(minutes, leaderMinutes)
  return reading === "the same speed" ? "has the same speed" : `is ${reading}`
}

type AuditorReading = Reading & {
  readonly yield: number
  readonly minutes: number
  readonly examples: number
}

function auditorReading(row: AuditorRow, workClass: WorkClass): AuditorReading {
  const samples = auditorSamples(row, workClass)
  return {
    identity: row.identity,
    yield: mean(samples.map((sample) => sample.yield)),
    minutes: mean(samples.map((sample) => sample.minutes)),
    examples: samples.length,
  }
}

/** The admitted auditors ranked by yield, each graded against the leader. */
function auditorRanking(
  readings: readonly AuditorReading[],
  workClass: WorkClass,
): string[] {
  if (readings.length < 2) return []
  const [leader, ...rest] = leaderFirst(readings, (reading) => [
    reading.yield,
    -reading.minutes,
  ])
  return [
    `for ${workClass} audits, ${modelText(leader.identity)} has the highest yield (${numberText(leader.yield)} accepted A/B findings per round at ${numberText(leader.minutes)} min, from ${plural(leader.examples, "example")})`,
    ...rest.map(
      (reading) =>
        `${modelText(reading.identity)} has ${yieldWords(reading.yield, leader.yield)} (${numberText(reading.yield)}) and ${speedClause(reading.minutes, leader.minutes)} (${numberText(reading.minutes)} min), from ${plural(reading.examples, "example")}`,
    ),
  ]
}

type CoderReading = Reading & {
  readonly value: number
  readonly plans: number
}

function coderReadings(
  rows: ReadonlyMap<string, CoderRow>,
  samples: (row: CoderRow) => readonly { readonly value: number }[],
): CoderReading[] {
  return sortedRows(rows)
    .map(([, row]) => ({ identity: row.identity, samples: samples(row) }))
    .filter((row) => row.samples.length >= coderFloor)
    .map((row) => ({
      identity: row.identity,
      value: mean(row.samples.map((sample) => sample.value)),
      plans: row.samples.length,
    }))
}

/** The admitted coders ranked by accepted findings against their steps, fewest first. */
function coderYieldRanking(rows: ReadonlyMap<string, CoderRow>): string[] {
  const readings = coderReadings(rows, (row) =>
    row.yieldSamples.map((sample) => ({ value: sample.yield })),
  )
  if (readings.length < 2) return []
  const [leader, ...rest] = leaderFirst(readings, (reading) => [-reading.value])
  return [
    `for coder yield, ${modelText(leader.identity)} has the lowest yield (${numberText(leader.value)} accepted A/B findings per step, from ${plural(leader.plans, "plan")})`,
    ...rest.map(
      (reading) =>
        `${modelText(reading.identity)} has ${yieldWords(reading.value, leader.value)} (${numberText(reading.value)}), from ${plural(reading.plans, "plan")}`,
    ),
  ]
}

/** The admitted coders ranked by time per step, fastest first. */
function coderTimeRanking(rows: ReadonlyMap<string, CoderRow>): string[] {
  const readings = coderReadings(rows, (row) =>
    row.timeSamples.map((sample) => ({ value: sample.minutes })),
  )
  if (readings.length < 2) return []
  const [leader, ...rest] = leaderFirst(readings, (reading) => [-reading.value])
  return [
    `for coder time, ${modelText(leader.identity)} is fastest (${numberText(leader.value)} min per step, from ${plural(leader.plans, "plan")})`,
    ...rest.map(
      (reading) =>
        `${modelText(reading.identity)} ${speedClause(reading.value, leader.value)} (${numberText(reading.value)} min), from ${plural(reading.plans, "plan")}`,
    ),
  ]
}

function auditorSamples(
  row: AuditorRow,
  workClass: WorkClass,
): AuditorSample[] {
  return row.samples.filter((sample) => sample.workClass === workClass)
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

function configuredAuditSelections(settings: RoundSettings): Array<{
  readonly model: string
  readonly effort: string
}> {
  return (["claude", "codex"] as const).map((assistant) => {
    const configured = settings.phases.audit[assistant]
    const defaults = settings.defaults[assistant]
    return {
      model: configured.model === "default" ? defaults.model : configured.model,
      effort:
        configured.effort === "default" ? defaults.effort : configured.effort,
    }
  })
}

function currentAuditSetting(
  identity: ModelIdentity,
  settings: RoundSettings,
): boolean {
  return configuredAuditSelections(settings).some(
    (selection) =>
      identity.effort === selection.effort &&
      (identity.model === selection.model ||
        identity.model.includes(selection.model)),
  )
}

function auditorSentence(
  rows: ReadonlyMap<string, AuditorRow>,
  workClass: WorkClass,
  settings: RoundSettings,
): string {
  const entries = sortedRows(rows)
  if (entries.length === 0)
    return `No ${workClass} auditor records are available.`
  const clauses: string[] = []
  for (const [, row] of entries) {
    const shortage = shortageClause(
      row.identity,
      auditorSamples(row, workClass).length,
      auditorFloor,
      `for ${workClass} audits`,
    )
    if (shortage !== null) clauses.push(shortage)
  }
  clauses.push(
    ...auditorRanking(
      entries
        .filter(
          ([, row]) => auditorSamples(row, workClass).length >= auditorFloor,
        )
        .map(([, row]) => auditorReading(row, workClass)),
      workClass,
    ),
  )
  const recommendation = auditorRecommendation(rows, workClass)
  if (recommendation === null)
    clauses.push(`the records do not separate one ${workClass} auditor clearly`)
  else {
    const identity =
      rows.get(recommendation)?.identity ?? entries[0][1].identity
    clauses.push(
      `the records clearly support running ${modelText(identity)} for ${workClass} audits`,
    )
    if (!currentAuditSetting(identity, settings))
      clauses.push(`${modelText(identity)} is not a current audit setting`)
  }
  return joinedSentence(clauses)
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
  const lines = [
    "| Model | Rounds | A/B kept | Dropped | Downgraded | Disproved | Wrong claims | Minutes per round |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]
  for (const [, row] of sortedRows(rows)) {
    const samples = auditorSamples(row, workClass)
    const counts = auditorCounts(row, workClass)
    lines.push(
      `| ${escapeCell(modelText(row.identity))} | ${samples.length} | ${counts.kept} | ${counts.dropped} | ${counts.downgraded} | ${counts.disproved} | ${wrongClaims(counts)} | ${samples.length === 0 ? "—" : numberText(mean(samples.map((sample) => sample.minutes)))} |`,
    )
  }
  return lines
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

function coderSentence(
  rows: ReadonlyMap<string, CoderRow>,
  settings: RoundSettings,
): string {
  const entries = sortedRows(rows)
  if (entries.length === 0) return "No coder records are available."
  const clauses: string[] = []
  for (const [, row] of entries) {
    const yieldShortage = shortageClause(
      row.identity,
      row.yieldSamples.length,
      coderFloor,
      "for coder yield",
    )
    if (yieldShortage !== null) clauses.push(yieldShortage)
    const timeShortage = shortageClause(
      row.identity,
      row.timeSamples.length,
      coderFloor,
      "for coder time",
    )
    if (timeShortage !== null) clauses.push(timeShortage)
  }
  clauses.push(...coderYieldRanking(rows), ...coderTimeRanking(rows))
  const recommendation = coderRecommendation(rows)
  if (recommendation === null)
    clauses.push("the records do not separate one coder clearly")
  else {
    const identity =
      rows.get(recommendation)?.identity ?? entries[0][1].identity
    clauses.push(`the records clearly support running ${modelText(identity)}`)
    const current = new Set(settings.coders.map((coder) => modelKey(coder)))
    if (!current.has(recommendation))
      clauses.push(`${modelText(identity)} is not in the current coder list`)
  }
  return joinedSentence(clauses)
}

function coderTable(rows: ReadonlyMap<string, CoderRow>): string[] {
  const lines = [
    "| Model | Plans | Timed plans | Steps | A/B kept | Minutes per step |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ]
  for (const [, row] of sortedRows(rows)) {
    const timedSteps = row.timeSamples.reduce(
      (total, sample) => total + sample.steps,
      0,
    )
    const totalMinutes = row.timeSamples.reduce(
      (total, sample) => total + sample.minutes * sample.steps,
      0,
    )
    lines.push(
      `| ${escapeCell(modelText(row.identity))} | ${row.yieldSamples.length} | ${row.timeSamples.length} | ${row.yieldSamples.reduce((total, sample) => total + sample.steps, 0)} | ${row.yieldSamples.reduce((total, sample) => total + sample.kept, 0)} | ${timedSteps === 0 ? "—" : numberText(totalMinutes / timedSteps)} |`,
    )
  }
  return lines
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
  const lines = [
    "# Model read-out",
    "",
    "## Planning auditors",
    "",
    auditorSentence(evidence.auditors, "planning", settings),
    "",
    ...auditorTable(evidence.auditors, "planning"),
    "",
    "## Implementation auditors",
    "",
    auditorSentence(evidence.auditors, "implementation", settings),
    "",
    ...auditorTable(evidence.auditors, "implementation"),
    "",
    "A/B kept counts accepted A and B findings after later disprovals. Dropped and downgraded record the round's result. Disproved records the user's later ruling. Wrong claims is dropped, downgraded and disproved as a percentage of all four counts. Auditor time includes audit and rebuttal only.",
    "",
    "## Coders",
    "",
    coderSentence(evidence.coders, settings),
    "",
    ...coderTable(evidence.coders),
    "",
    "One coder example is one closed plan with a readable model record for every hosted step share, one recorded coder and a complete whole-plan implementation audit after the final step. A ready assignment, when present, must name that coder. A step without recorded active time uses the span from the ready marker or previous step to its own later share commit. Time adds step time and implementation-round fix time. Planning-round fixes do not enter coder evidence.",
    "",
    ...disprovedSection(evidence.disproved),
    "",
    ...excludedSection(evidence.coders),
  ]
  return `${lines.join("\n")}\n`
}
