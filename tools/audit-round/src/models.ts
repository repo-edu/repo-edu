import { mean } from "simple-statistics"
import type { ExecutionContext } from "./context.js"
import {
  type AuditorPlanComparison,
  type AuditorPlanSample,
  auditorFloor,
  clearlyPreferred,
  coderFloor,
  compareAuditorPlans,
  hasUnevenOpeners,
  type ReadingSample,
} from "./model-comparison.js"
import {
  type AuditorRow,
  type AuditorSample,
  auditorKey,
  type CoderRow,
  type DisprovedEvidence,
  type DisprovedParty,
  type FindingCounts,
  type ModelIdentity,
  modelKey,
  modelText,
  type PairEnding,
  type RoundVet,
  type RuledFinding,
  type RulerWinner,
  readModelEvidence,
  type VetPairSample,
  type WorkClass,
} from "./model-evidence.js"
import { type TierRange, tierRanges, tierWithin } from "./round-data.js"
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

/** The row's rounds in the class as comparison samples whose yield counts the range. */
function planSamples(
  row: AuditorRow,
  workClass: WorkClass,
  range: TierRange,
): AuditorPlanSample[] {
  return auditorSamples(row, workClass).map((sample) => ({
    plan: sample.plan,
    first: sample.first,
    minutes: sample.minutes,
    yield: sample.counts[range].kept,
  }))
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

/** Whether a listed planning auditor runs the row's model and effort. */
function listedPlanningAuditor(
  identity: ModelIdentity,
  settings: RoundSettings,
): boolean {
  return settings.planningAudit.auditors.some(
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

/** Only the historical A/B comparison includes disprovals without a recorded tier. */
function detachedDisprovedPlans(
  row: AuditorRow,
  workClass: WorkClass,
  range: TierRange,
): readonly string[] {
  return range === "A/B" ? row.detachedDisproved[workClass] : []
}

function auditorCounts(
  row: AuditorRow,
  workClass: WorkClass,
  range: TierRange,
): FindingCounts {
  return auditorSamples(row, workClass).reduce(
    (total, sample) => addCounts(total, sample.counts[range]),
    {
      kept: 0,
      dropped: 0,
      downgraded: 0,
      disproved: detachedDisprovedPlans(row, workClass, range).length,
    },
  )
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
  range: TierRange,
): AuditorReading[] {
  const classEntries = [...rows.values()].map((row) => ({
    row,
    samples: planSamples(row, workClass, range),
  }))
  return classEntries.map(({ row, samples }) => ({
    identity: row.identity,
    comparison: compareAuditorPlans(
      samples,
      classEntries
        .filter((entry) => entry.row !== row)
        .map((entry) => entry.samples),
    ),
    counts: auditorCounts(row, workClass, range),
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

/**
 * One reading per plan and auditor. Plans run from the newest complete round
 * of the class to the oldest, so the plans in work open the table. A plan with
 * no such round, known only through a detached disproved finding, comes last
 * by name, because its rounds predate the retained data.
 */
function auditorPlanReadings(
  rows: ReadonlyMap<string, AuditorRow>,
  workClass: WorkClass,
  range: TierRange,
): AuditorPlanReading[] {
  const readings = new Map<string, AuditorPlanReading>()
  const newestRound = new Map<string, string>()
  const ensureReading = (plan: string, identity: ModelIdentity) => {
    const key = `${plan}\u0000${auditorKey(identity)}`
    const reading = readings.get(key) ?? {
      plan,
      identity,
      rounds: 0,
      counts: { kept: 0, dropped: 0, downgraded: 0, disproved: 0 },
      minutes: 0,
    }
    readings.set(key, reading)
    return reading
  }

  for (const row of rows.values()) {
    for (const sample of auditorSamples(row, workClass)) {
      const reading = ensureReading(sample.plan, row.identity)
      reading.rounds += 1
      reading.counts = addCounts(reading.counts, sample.counts[range])
      reading.minutes += sample.minutes
      if ((newestRound.get(sample.plan) ?? "") < sample.started)
        newestRound.set(sample.plan, sample.started)
    }

    for (const plan of detachedDisprovedPlans(row, workClass, range)) {
      const reading = ensureReading(plan, row.identity)
      reading.counts = {
        ...reading.counts,
        disproved: reading.counts.disproved + 1,
      }
    }
  }

  const planTime = (plan: string) => newestRound.get(plan) ?? ""
  return [...readings.values()].sort(
    (first, second) =>
      planTime(second.plan).localeCompare(planTime(first.plan)) ||
      first.plan.localeCompare(second.plan) ||
      modelText(first.identity).localeCompare(modelText(second.identity)),
  )
}

function auditorPlanTable(
  readings: readonly AuditorPlanReading[],
  range: TierRange,
): string[] {
  let previousPlan: string | null = null
  return [
    `| Plan | Model | Rounds | ${range} kept | Dropped | Downgraded | Disproved | Minutes per round |`,
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...readings.map((reading) => {
      const plan = reading.plan === previousPlan ? "" : reading.plan
      previousPlan = reading.plan
      return `| ${escapeCell(plan)} | ${escapeCell(modelText(reading.identity))} | ${reading.rounds} | ${reading.counts.kept} | ${reading.counts.dropped} | ${reading.counts.downgraded} | ${reading.counts.disproved} | ${reading.rounds === 0 ? "—" : numberText(reading.minutes / reading.rounds)} |`
    }),
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
  return `Not in the current \`planningAudit.auditors\` list, opened an uneven share: ${entries
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
  range: TierRange,
): string[] {
  if (rows.size === 0)
    return [
      `No ${workClass} auditor records are available.`,
      "",
      ...auditorTable([]),
    ]
  const readings = orderedAuditorReadings(
    auditorReadings(rows, workClass, range),
  )
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

/** The row's plans as comparison samples whose yield is the range's kept findings per step. */
function coderSamples(row: CoderRow, range: TierRange): ReadingSample[] {
  return row.samples.map((sample) => ({
    yield: sample.kept[range] / sample.steps,
    minutes: sample.minutes,
  }))
}

function coderRecommendation(
  rows: ReadonlyMap<string, CoderRow>,
  range: TierRange,
): string | null {
  const ranked = sortedRows(rows).filter(
    ([, row]) => row.samples.length >= coderFloor,
  )
  if (ranked.length < 2) return null
  const winners = ranked.filter(([candidateKey, candidate]) =>
    ranked.every(
      ([otherKey, other]) =>
        candidateKey === otherKey ||
        clearlyPreferred(
          coderSamples(candidate, range),
          coderSamples(other, range),
          false,
        ),
    ),
  )
  return winners.length === 1 ? winners[0][0] : null
}

function coderReading(
  rows: ReadonlyMap<string, CoderRow>,
  settings: RoundSettings,
  range: TierRange,
): string[] {
  const entries = sortedRows(rows)
  if (entries.length === 0) return ["No coder records are available."]
  const notes = entries
    .map(([, row]) => shortageNote(row))
    .filter((note): note is string => note !== null)
  const recommendation = coderRecommendation(rows, range)
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

function coderTable(
  rows: ReadonlyMap<string, CoderRow>,
  range: TierRange,
): string[] {
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
      kept: row.samples.reduce(
        (total, sample) => total + sample.kept[range],
        0,
      ),
      yield: mean(coderSamples(row, range).map((sample) => sample.yield)),
      minutes: totalMinutes / steps,
    }
  })
  return [
    `| Model | Plans | Steps | ${range} kept | ${range} per step | Minutes per step |`,
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

type VetPairRow = {
  readonly first: ModelIdentity
  readonly second: ModelIdentity
  shared: number
  splits: number
  readonly endings: Record<PairEnding, number>
}

/** One row per pair of vetters with a shared finding of the class graded within the range. */
function vetPairRows(
  samples: readonly VetPairSample[],
  workClass: WorkClass,
  range: TierRange,
): VetPairRow[] {
  const rows = new Map<string, VetPairRow>()
  for (const sample of samples) {
    if (sample.workClass !== workClass || !tierWithin(sample.grade, range))
      continue
    const key = `${auditorKey(sample.first)}\u0000${auditorKey(sample.second)}`
    const row = rows.get(key) ?? {
      first: sample.first,
      second: sample.second,
      shared: 0,
      splits: 0,
      endings: { first: 0, second: 0, both: 0, neither: 0 },
    }
    rows.set(key, row)
    row.shared += 1
    if (sample.ending === null) continue
    row.splits += 1
    row.endings[sample.ending] += 1
  }
  return [...rows.values()].sort(
    (first, second) =>
      modelText(first.first).localeCompare(modelText(second.first)) ||
      modelText(first.second).localeCompare(modelText(second.second)),
  )
}

function vetPairSection(
  samples: readonly VetPairSample[],
  workClass: WorkClass,
  range: TierRange,
): string[] {
  const rows = vetPairRows(samples, workClass, range)
  if (rows.length === 0)
    return [
      `No two ${workClass} vetters have judged the same ${range === "A/B" ? "A or B" : "C"} finding.`,
    ]
  return [
    `| Vetter 1 | Vetter 2 | Shared ${range} findings | Ruled splits | Split: vetter 1 right | Split: vetter 2 right | Split: both right | Split: neither right |`,
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(modelText(row.first))} | ${escapeCell(modelText(row.second))} | ${row.shared} | ${row.splits} | ${row.endings.first} | ${row.endings.second} | ${row.endings.both} | ${row.endings.neither} |`,
    ),
  ]
}

/** The text through the first `.`, `!` or `?` that ends a sentence, or all of it when none does. */
function firstSentence(text: string): string {
  return /^.*?[.!?](?=\s|$)/s.exec(text)?.[0] ?? text
}

type ReasonRow = {
  readonly cells: readonly string[]
  readonly reason: string
}

/**
 * A numbered table whose last column shows each reason's first sentence,
 * followed by the full reasons under the same numbers, because a full reason
 * wraps the terminal table into an unreadable grid.
 */
function reasonTable(
  columns: readonly string[],
  rows: readonly ReasonRow[],
  start: number,
): string[] {
  return [
    `| # | ${columns.join(" | ")} | Reason |`,
    `| ---: | ${columns.map(() => "---").join(" | ")} | --- |`,
    ...rows.map(
      (row, index) =>
        `| ${[start + index, ...row.cells, escapeCell(firstSentence(row.reason))].join(" | ")} |`,
    ),
    "",
    ...rows.map((row, index) => `${start + index}. ${row.reason}`),
  ]
}

function vetsCell(vets: readonly RoundVet[]): string {
  return escapeCell(
    vets.length === 0
      ? "no recorded vetter"
      : vets
          .map(
            (vet) =>
              `${modelText(vet.identity)}: ${vet.verdict ?? "no verdict"}`,
          )
          .join("; "),
  )
}

/** The stored winner, with each winning vetter named by its model. */
function answerCell(entry: RuledFinding): string {
  if (typeof entry.winner === "string") return entry.winner
  return escapeCell(
    entry.winner
      .map((tag) => {
        const vet = entry.vets.find((candidate) => candidate.tag === tag)
        return vet === undefined ? tag : modelText(vet.identity)
      })
      .join("; "),
  )
}

/** The row cells a stored winner shares in the user's list and the ruler's. */
function winnerCells(entry: RuledFinding, ruler: readonly string[]): ReasonRow {
  return {
    cells: [
      escapeCell(`${entry.stem}; ${entry.target} round ${entry.round}`),
      escapeCell(`#${entry.finding} ${entry.title}`),
      entry.tier,
      escapeCell(modelText(entry.auditor)),
      vetsCell(entry.vets),
      ...ruler,
      answerCell(entry),
    ],
    reason: entry.reason,
  }
}

function rulingSection(
  entries: readonly RuledFinding[],
  workClass: WorkClass,
): string[] {
  const lines = [`## ${titleCase(workClass)} ruling winners`, ""]
  const findings = entries.filter((entry) => entry.workClass === workClass)
  if (findings.length === 0)
    return [...lines, `No ${workClass} round holds a winner the user named.`]
  return [
    ...lines,
    ...reasonTable(
      ["Plan and round", "Finding", "Tier", "Auditor", "Vetters", "Answer"],
      findings.map((entry) => winnerCells(entry, [])),
      1,
    ),
  ]
}

/**
 * The ruler's winners in the form of the user's list, with the ruler that named
 * each, so the user can check them and overturn one with `disprove`.
 */
function rulerSection(
  entries: readonly RulerWinner[],
  workClass: WorkClass,
): string[] {
  const lines = [`## ${titleCase(workClass)} ruler winners`, ""]
  const winners = entries.filter((entry) => entry.workClass === workClass)
  if (winners.length === 0)
    return [...lines, `No ${workClass} round holds a winner the ruler named.`]
  return [
    ...lines,
    ...reasonTable(
      [
        "Plan and round",
        "Finding",
        "Tier",
        "Auditor",
        "Vetters",
        "Ruler",
        "Answer",
      ],
      winners.map((entry) =>
        winnerCells(entry, [
          escapeCell(
            entry.ruler === null ? "no recorded ruler" : modelText(entry.ruler),
          ),
        ]),
      ),
      1,
    ),
  ]
}

function partiesCell(parties: readonly DisprovedParty[]): string {
  if (parties.length === 0) return "—"
  return escapeCell(
    parties
      .map(
        (party) =>
          `${party.role} ${party.identity === null ? "not recorded" : modelText(party.identity)}${party.detail === null ? "" : ` (${party.detail})`}`,
      )
      .join("; "),
  )
}

function disprovedRow(entry: DisprovedEvidence): ReasonRow {
  return {
    cells: [
      entry.date,
      ...(entry.kind === "detached"
        ? [
            escapeCell(
              `${entry.stem}; no retained round data holds this finding`,
            ),
            "—",
            "—",
          ]
        : [
            escapeCell(`${entry.stem}; ${entry.target} round ${entry.round}`),
            escapeCell(`#${entry.finding} ${entry.title}`),
            entry.tier,
          ]),
      partiesCell(entry.wrong),
      partiesCell(entry.right),
    ],
    reason: entry.reason,
  }
}

/** The model a table's rows group by: the auditor, or the ruler in a ruler table. */
function disprovedModel(entry: DisprovedEvidence): string {
  if (entry.claim !== "ruler") return modelText(entry.auditor)
  const ruler = entry.wrong.find((party) => party.role === "ruler")?.identity
  return ruler == null ? "" : modelText(ruler)
}

const disprovedClaims = [
  ["auditor", "auditor findings"],
  ["vetter", "vetter verdicts"],
  ["ruler", "ruler winners"],
] as const

/**
 * One table per claim and work class, named like the sections above it, and
 * printed only when it has rows. Each row lists who the ruling proved wrong
 * and who right. A table's rows group by model, newest first within one. Each
 * table shows a reason's first sentence and its numbered list the full reason.
 */
function disprovedSection(entries: readonly DisprovedEvidence[]): string[] {
  const lines = ["## Disproved after the round", ""]
  if (entries.length === 0)
    return [
      ...lines,
      "No findings or vet verdicts were disproved after a round.",
    ]
  let numbered = 0
  for (const [claim, title] of disprovedClaims)
    for (const workClass of ["planning", "implementation"] as const) {
      const rows = entries
        .filter(
          (entry) => entry.claim === claim && entry.workClass === workClass,
        )
        .sort(
          (first, second) =>
            disprovedModel(first).localeCompare(disprovedModel(second)) ||
            second.date.localeCompare(first.date) ||
            first.stem.localeCompare(second.stem),
        )
      if (rows.length === 0) continue
      if (lines.length > 2) lines.push("")
      lines.push(
        `### ${titleCase(workClass)} ${title}`,
        "",
        ...reasonTable(
          ["Date", "Plan and round", "Finding", "Tier", "Wrong", "Right"],
          rows.map(disprovedRow),
          numbered + 1,
        ),
      )
      numbered += rows.length
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

/** One section per tier range, each titled with its range and closed by a blank line. */
function rangeSections(
  title: string,
  body: (range: TierRange) => readonly string[],
): string[] {
  return tierRanges.flatMap((range) => [
    `## ${title}, ${range} findings`,
    "",
    ...body(range),
    "",
  ])
}

/**
 * Read every retained model record and render the auditor, vetter-pair and coder
 * results with the user's rulings and the ruler's winners.
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
    ...rangeSections("Planning auditors", (range) =>
      auditorSection(planning, "planning", settings, range),
    ),
    ...rangeSections("Implementation auditors", (range) =>
      auditorSection(implementation, "implementation", settings, range),
    ),
    `Auditor rows sort by the gap between the two per-round figures, then by time. A model with fewer than ${auditorFloor} shared plans in a section is printed in a second table below the main one. Each per-round figure divides the kept findings by the rounds in the count cell beside it, over all shared plans. The reported tier determines the section. A kept C finding counts as downgraded only if it ended at D. Wrong claims is the percentage of claims that were dropped, downgraded or later disproved across all complete rounds. The A/B figures also include later disprovals with no recorded tier. Auditor time includes audit and rebuttal only.`,
    "",
    ...rangeSections("Planning vetter pairs", (range) =>
      vetPairSection(evidence.vetPairs, "planning", range),
    ),
    ...rangeSections("Implementation vetter pairs", (range) =>
      vetPairSection(evidence.vetPairs, "implementation", range),
    ),
    "A vetter is a model and an effort. Each row counts the findings that both vetters judged on one panel. The highest tier given by the audit report or any vetter determines the section. Ruled splits counts the shared findings where the two vetters split and a winner is stored. The user names the winner on an A or B finding and the ruler on a C finding. The four Split columns show how those ruled splits ended. A later disproved finding proves right the vetters that dropped it, and a later vet ruling proves right the vetters that accepted it.",
    "",
    ...rangeSections("Coders", (range) => [
      ...coderReading(coders, settings, range),
      "",
      ...coderTable(coders, range),
    ]),
    "Rows sort by the per-step figure, the mean over plans of accepted findings per step, fewest first, then by time. Each section's verdict rests on its own figures. One coder example is one closed plan with a readable model record for every hosted step share, one recorded coder and a complete whole-plan implementation audit after the final step. A ready assignment, when present, must name that coder's assistant and effort. The assignment may be a family alias, so the records name the release. A step without recorded active time uses the span from the ready marker or previous step to its own later share commit, and a plan whose step time cannot be read is excluded. Time adds step time and implementation-round fix time. Planning-round fixes do not enter coder evidence.",
    "",
    ...rulingSection(evidence.rulings, "planning"),
    "",
    ...rulingSection(evidence.rulings, "implementation"),
    "",
    ...rulerSection(evidence.rulerWinners, "planning"),
    "",
    ...rulerSection(evidence.rulerWinners, "implementation"),
    "",
    ...disprovedSection(evidence.disproved),
    ...(options.all
      ? [
          "",
          ...rangeSections("Planning rounds by plan", (range) =>
            auditorPlanTable(
              auditorPlanReadings(evidence.auditors, "planning", range),
              range,
            ),
          ),
          ...rangeSections("Implementation rounds by plan", (range) =>
            auditorPlanTable(
              auditorPlanReadings(evidence.auditors, "implementation", range),
              range,
            ),
          ),
          ...excludedSection(evidence.coders),
        ]
      : []),
  ]
  return `${lines.join("\n")}\n`
}
