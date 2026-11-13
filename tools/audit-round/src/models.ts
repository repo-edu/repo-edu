import { mean } from "simple-statistics"
import type { ExecutionContext } from "./context.js"
import {
  type AuditorPlanComparison,
  auditorFloor,
  clearlyPreferred,
  coderFloor,
  compareAuditorPlans,
  hasUnevenOpeners,
} from "./model-comparison.js"
import {
  type AuditorRow,
  type AuditorSample,
  auditorKey,
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

/** A note line for a coder below the comparison floor, or null when it is compared. */
function shortageNote(row: CoderRow): string | null {
  const missing = coderFloor - row.samples.length
  if (missing <= 0) return null
  return `${modelText(row.identity)} needs ${plural(missing, "more plan")} before it is compared.`
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
 * tables rather than printing a zero row.
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
  return new Map([...rows].filter(([, row]) => row.samples.length > 0))
}

/** Whether a planning auditor entry runs the row's model and effort. */
function listedPlanningAuditor(
  identity: ModelIdentity,
  settings: RoundSettings,
): boolean {
  return settings.planning.auditors.some(
    (auditor) =>
      identity.effort === auditor.effort &&
      (identity.model === auditor.model ||
        identity.model.includes(auditor.model)),
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

type AuditorReading = {
  readonly identity: ModelIdentity
  readonly comparison: AuditorPlanComparison
  readonly counts: FindingCounts
  readonly minutes: number
}

function auditorReadings(
  rows: ReadonlyMap<string, AuditorRow>,
  workClass: WorkClass,
): AuditorReading[] {
  const classEntries = [...rows.values()].map((row) => ({
    row,
    samples: auditorSamples(row, workClass),
  }))
  return classEntries.map(({ row, samples }) => ({
    identity: row.identity,
    comparison: compareAuditorPlans(
      samples,
      classEntries
        .filter((entry) => entry.row !== row)
        .map((entry) => entry.samples),
    ),
    counts: auditorCounts(row, workClass),
    minutes: mean(samples.map((sample) => sample.minutes)),
  }))
}

function orderedAuditorReadings(readings: readonly AuditorReading[]) {
  return leaderFirst(readings, (reading) => [
    reading.comparison.ownPerRound === null ||
    reading.comparison.otherPerRound === null
      ? Number.NEGATIVE_INFINITY
      : reading.comparison.ownPerRound - reading.comparison.otherPerRound,
    -reading.minutes,
  ])
}

/** One correctable bullet per listed auditor whose opener share is uneven. */
function listedOpenerBullets(
  readings: readonly AuditorReading[],
  settings: RoundSettings,
): string[] {
  return readings
    .filter(
      (reading) =>
        hasUnevenOpeners(reading.comparison) &&
        listedPlanningAuditor(reading.identity, settings),
    )
    .map(
      (reading) =>
        `- \`${modelText(reading.identity)}\` opened ${reading.comparison.openedPlans} of ${reading.comparison.plans} plans.`,
    )
}

function auditorTable(readings: readonly AuditorReading[]): string[] {
  return [
    "| Model | Plans | Own findings in rounds | Own per round | Others on same plans | Others per round | Minutes per round | Wrong claims |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...readings.map(
      (reading) =>
        `| ${escapeCell(modelText(reading.identity))} | ${reading.comparison.plans} | ${reading.comparison.ownFindings} in ${reading.comparison.ownRounds} | ${yieldCell(reading.comparison.ownPerRound)} | ${reading.comparison.otherFindings} in ${reading.comparison.otherRounds} | ${yieldCell(reading.comparison.otherPerRound)} | ${numberText(reading.minutes)} | ${wrongClaims(reading.counts)} |`,
    ),
  ]
}

type AuditorPlanReading = {
  readonly plan: string
  readonly identity: ModelIdentity
  rounds: number
  counts: FindingCounts
  minutes: number
}

function auditorPlanReadings(
  rows: ReadonlyMap<string, AuditorRow>,
  disproved: readonly DisprovedEvidence[],
  workClass: WorkClass,
): AuditorPlanReading[] {
  const readings = new Map<string, AuditorPlanReading>()
  const ensureReading = (plan: string, identity: ModelIdentity) => {
    const key = `${plan}\u0000${auditorKey(identity)}`
    const reading = readings.get(key) ?? {
      plan,
      identity: rows.get(auditorKey(identity))?.identity ?? identity,
      rounds: 0,
      counts: { kept: 0, dropped: 0, downgraded: 0, disproved: 0 },
      minutes: 0,
    }
    readings.set(key, reading)
    return reading
  }

  for (const row of rows.values())
    for (const sample of auditorSamples(row, workClass)) {
      const reading = ensureReading(sample.plan, row.identity)
      reading.rounds += 1
      reading.counts = addCounts(reading.counts, sample.counts)
      reading.minutes += sample.minutes
    }

  for (const entry of disproved)
    if (entry.kind === "detached" && entry.workClass === workClass) {
      const reading = ensureReading(entry.stem, entry.auditor)
      reading.counts = {
        ...reading.counts,
        disproved: reading.counts.disproved + 1,
      }
    }

  return [...readings.values()].sort(
    (first, second) =>
      first.plan.localeCompare(second.plan) ||
      modelText(first.identity).localeCompare(modelText(second.identity)),
  )
}

function auditorPlanTable(readings: readonly AuditorPlanReading[]): string[] {
  let previousPlan: string | null = null
  return [
    "| Plan | Model | Rounds | A/B kept | Dropped | Downgraded | Disproved | Minutes per round |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...readings.map((reading) => {
      const plan = reading.plan === previousPlan ? "" : reading.plan
      previousPlan = reading.plan
      return `| ${escapeCell(plan)} | ${escapeCell(modelText(reading.identity))} | ${reading.rounds} | ${reading.counts.kept} | ${reading.counts.dropped} | ${reading.counts.downgraded} | ${reading.counts.disproved} | ${reading.rounds === 0 ? "—" : numberText(reading.minutes / reading.rounds)} |`
    }),
  ]
}

function auditorPlanSection(
  rows: ReadonlyMap<string, AuditorRow>,
  disproved: readonly DisprovedEvidence[],
  workClass: WorkClass,
): string[] {
  return [
    `## ${workClass === "planning" ? "Planning" : "Implementation"} rounds by plan`,
    "",
    ...auditorPlanTable(auditorPlanReadings(rows, disproved, workClass)),
  ]
}

function unlistedOpenerLine(
  readings: readonly AuditorReading[],
  settings: RoundSettings,
): string | null {
  const entries = readings.filter(
    (reading) =>
      hasUnevenOpeners(reading.comparison) &&
      !listedPlanningAuditor(reading.identity, settings),
  )
  if (entries.length === 0) return null
  return `Not in the current auditors list, opened an uneven share: ${entries
    .map(
      (reading) =>
        `\`${modelText(reading.identity)}\` ${reading.comparison.openedPlans} of ${reading.comparison.plans}`,
    )
    .join("; ")}.`
}

function auditorSection(
  rows: ReadonlyMap<string, AuditorRow>,
  workClass: WorkClass,
  settings: RoundSettings,
): string[] {
  if (rows.size === 0)
    return [
      `No ${workClass} auditor records are available.`,
      "",
      ...auditorTable([]),
    ]
  const readings = orderedAuditorReadings(auditorReadings(rows, workClass))
  const compared = readings.filter(
    (reading) => reading.comparison.plans >= auditorFloor,
  )
  const thin = readings.filter(
    (reading) => reading.comparison.plans < auditorFloor,
  )
  const planning = workClass === "planning"
  const openers = planning ? listedOpenerBullets(readings, settings) : []
  const unlisted = planning ? unlistedOpenerLine(readings, settings) : null
  const blocks = [
    openers,
    compared.length === 0 ? [] : auditorTable(compared),
    thin.length === 0
      ? []
      : [`Fewer than ${auditorFloor} shared plans:`, "", ...auditorTable(thin)],
    unlisted === null ? [] : [unlisted],
  ].filter((block) => block.length > 0)
  return blocks.flatMap((block, index) =>
    index === 0 ? block : ["", ...block],
  )
}

function coderRecommendation(
  rows: ReadonlyMap<string, CoderRow>,
): string | null {
  const ranked = sortedRows(rows).filter(
    ([, row]) => row.samples.length >= coderFloor,
  )
  if (ranked.length < 2) return null
  const winners = ranked.filter(([candidateKey, candidate]) =>
    ranked.every(
      ([otherKey, other]) =>
        candidateKey === otherKey ||
        clearlyPreferred(candidate.samples, other.samples, false),
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
  const notes = entries
    .map(([, row]) => shortageNote(row))
    .filter((note): note is string => note !== null)
  const recommendation = coderRecommendation(rows)
  if (recommendation === null)
    return readingLines("The records do not separate one coder clearly.", notes)
  const identity = rows.get(recommendation)?.identity ?? entries[0][1].identity
  const current = new Set(
    settings.implementation.coders.map((coder) => modelKey(coder)),
  )
  return readingLines(
    `The records clearly support running ${modelText(identity)}.`,
    current.has(recommendation)
      ? notes
      : [`${modelText(identity)} is not in the current coder list.`, ...notes],
  )
}

function coderTable(rows: ReadonlyMap<string, CoderRow>): string[] {
  const readings = [...rows.values()].map((row) => {
    const steps = row.samples.reduce((total, sample) => total + sample.steps, 0)
    const totalMinutes = row.samples.reduce(
      (total, sample) => total + sample.minutes * sample.steps,
      0,
    )
    return {
      identity: row.identity,
      plans: row.samples.length,
      steps,
      kept: row.samples.reduce((total, sample) => total + sample.kept, 0),
      yield: mean(row.samples.map((sample) => sample.yield)),
      minutes: totalMinutes / steps,
    }
  })
  return [
    "| Model | Plans | Steps | A/B kept | A/B per step | Minutes per step |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...leaderFirst(readings, (reading) => [
      -reading.yield,
      -reading.minutes,
    ]).map(
      (reading) =>
        `| ${escapeCell(modelText(reading.identity))} | ${reading.plans} | ${reading.steps} | ${reading.kept} | ${yieldText(reading.yield)} | ${numberText(reading.minutes)} |`,
    ),
  ]
}

/** The text through the first `.`, `!` or `?` that ends a sentence, or all of it when none does. */
function firstSentence(text: string): string {
  return /^.*?[.!?](?=\s|$)/s.exec(text)?.[0] ?? text
}

function disprovedRow(number: number, entry: DisprovedEvidence): string {
  const reason = escapeCell(firstSentence(entry.reason))
  return entry.kind === "detached"
    ? `| ${number} | ${entry.date} | ${escapeCell(`${entry.stem}; no retained round data holds this finding`)} | — | — | — | ${reason} |`
    : `| ${number} | ${entry.date} | ${escapeCell(`${entry.stem}; ${entry.target} round ${entry.round}`)} | ${escapeCell(`#${entry.finding} ${entry.title}`)} | ${entry.tier} | ${escapeCell(`${entry.vet === null ? "no recorded vet" : modelText(entry.vet)}; ${entry.vetVerdict ?? "no verdict"}`)} | ${reason} |`
}

/**
 * Each auditor's table shows a reason's first sentence and the numbered list
 * below it the full reason, because a whole reason wraps a terminal table into
 * an unreadable grid. Numbers run across the section, so each ruling has one.
 */
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
  let numbered = 0
  for (const [auditor, group] of [...groups].sort(([first], [second]) =>
    first.localeCompare(second),
  )) {
    const rows = group.sort(
      (first, second) =>
        second.date.localeCompare(first.date) ||
        first.stem.localeCompare(second.stem),
    )
    const start = numbered + 1
    numbered += rows.length
    if (lines.length > 2) lines.push("")
    lines.push(
      `### ${auditor}`,
      "",
      "| # | Date | Plan and round | Finding | Tier | Vet | Reason |",
      "| ---: | --- | --- | --- | --- | --- | --- |",
      ...rows.map((entry, index) => disprovedRow(start + index, entry)),
      "",
      ...rows.map((entry, index) => `${start + index}. ${entry.reason}`),
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

/**
 * Read every retained model record and render the auditor and coder results.
 * The excluded plans print only under `all`: they explain which plans supplied
 * no evidence, which a reader comparing models does not need every time.
 */
export async function modelsReport(
  context: ExecutionContext,
  settings: RoundSettings,
  options: { readonly all: boolean } = { all: false },
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
    ...auditorSection(planning, "planning", settings),
    "",
    "## Implementation auditors",
    "",
    ...auditorSection(implementation, "implementation", settings),
    "",
    `Auditor rows sort by the gap between the two per-round figures, then by time. A model with fewer than ${auditorFloor} shared plans in a class is printed in a second table below the main one. Each per-round figure divides the kept A and B findings by the rounds in the count cell beside it, over all shared plans. Wrong claims covers every complete round: dropped and downgraded findings from the round plus the user's later disprovals, as a percentage of kept and wrong claims together. Auditor time includes audit and rebuttal only.`,
    "",
    "## Coders",
    "",
    ...coderReading(coders, settings),
    "",
    ...coderTable(coders),
    "",
    "Rows sort by A/B per step, the mean over plans of accepted findings per step, fewest first, then by time. One coder example is one closed plan with a readable model record for every hosted step share, one recorded coder and a complete whole-plan implementation audit after the final step. A ready assignment, when present, must name that coder's assistant and effort; the assignment may be a family alias, so the records name the release. A step without recorded active time uses the span from the ready marker or previous step to its own later share commit, and a plan whose step time cannot be read is excluded. Time adds step time and implementation-round fix time. Planning-round fixes do not enter coder evidence.",
    "",
    ...disprovedSection(evidence.disproved),
    ...(options.all
      ? [
          "",
          ...auditorPlanSection(
            evidence.auditors,
            evidence.disproved,
            "planning",
          ),
          "",
          ...auditorPlanSection(
            evidence.auditors,
            evidence.disproved,
            "implementation",
          ),
          "",
          ...excludedSection(evidence.coders),
        ]
      : []),
  ]
  return `${lines.join("\n")}\n`
}
