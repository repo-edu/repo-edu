import { format } from "date-fns"
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
  type FindingCounts,
  type ModelIdentity,
  modelKey,
  modelText,
  type PairEnding,
  type PairVetter,
  type RoundVet,
  type RuledFinding,
  type RulerWinner,
  type RulingJudge,
  type RulingParty,
  readModelEvidence,
  type VetPairSample,
  type VetterTimeRow,
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

/** An ordered pair of vetters and how its ruled splits ended. */
type RuledPairCounts = {
  readonly first: ModelIdentity
  readonly second: ModelIdentity
  splits: number
  readonly endings: Record<PairEnding, number>
}

type VetPairRow = RuledPairCounts & { shared: number }

function pairKey(first: ModelIdentity, second: ModelIdentity): string {
  return `${auditorKey(first)}\u0000${auditorKey(second)}`
}

function sortedPairRows<
  Row extends { readonly first: ModelIdentity; readonly second: ModelIdentity },
>(rows: Iterable<Row>, after: (first: Row, second: Row) => number = () => 0) {
  return [...rows].sort(
    (first, second) =>
      modelText(first.first).localeCompare(modelText(second.first)) ||
      modelText(first.second).localeCompare(modelText(second.second)) ||
      after(first, second),
  )
}

function emptyEndings(): Record<PairEnding, number> {
  return { first: 0, second: 0, both: 0, neither: 0 }
}

function classSamples(
  samples: readonly VetPairSample[],
  workClass: WorkClass,
  range: TierRange,
): VetPairSample[] {
  return samples.filter(
    (sample) =>
      sample.workClass === workClass && tierWithin(sample.grade, range),
  )
}

/** One row per pair of vetters with a shared finding of the class graded within the range. */
function vetPairRows(
  samples: readonly VetPairSample[],
  workClass: WorkClass,
  range: TierRange,
): VetPairRow[] {
  const rows = new Map<string, VetPairRow>()
  for (const sample of classSamples(samples, workClass, range)) {
    const key = pairKey(sample.first.identity, sample.second.identity)
    const row = rows.get(key) ?? {
      first: sample.first.identity,
      second: sample.second.identity,
      shared: 0,
      splits: 0,
      endings: emptyEndings(),
    }
    rows.set(key, row)
    row.shared += 1
    if (sample.ruling === null) continue
    row.splits += 1
    row.endings[sample.ruling.ending] += 1
  }
  return sortedPairRows(rows.values())
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

/**
 * A shared finding seen from the vetter that ran on its auditor's model and
 * effort: that vetter first and the ending turned to match. Only an exact
 * release and effort match counts, so a shared vendor, an alias or a missing
 * effort does not. A pair with no such vetter, or with two, supplies none.
 */
type AuditorVetterSample = {
  readonly own: PairVetter
  readonly other: PairVetter
  readonly ruling: VetPairSample["ruling"]
}

function sameSelection(vetter: ModelIdentity, auditor: ModelIdentity): boolean {
  return (
    vetter.effort !== null &&
    vetter.model === auditor.model &&
    vetter.effort === auditor.effort
  )
}

const turnedEnding: Record<PairEnding, PairEnding> = {
  first: "second",
  second: "first",
  both: "both",
  neither: "neither",
}

function auditorVetterSample(
  sample: VetPairSample,
): AuditorVetterSample | null {
  const firstOwn = sameSelection(sample.first.identity, sample.auditor)
  const secondOwn = sameSelection(sample.second.identity, sample.auditor)
  if (firstOwn === secondOwn) return null
  if (firstOwn)
    return { own: sample.first, other: sample.second, ruling: sample.ruling }
  return {
    own: sample.second,
    other: sample.first,
    ruling:
      sample.ruling === null
        ? null
        : { ...sample.ruling, ending: turnedEnding[sample.ruling.ending] },
  }
}

function auditorVetterSamples(
  samples: readonly VetPairSample[],
  workClass: WorkClass,
  range: TierRange,
): AuditorVetterSample[] {
  return classSamples(samples, workClass, range).flatMap((sample) => {
    const turned = auditorVetterSample(sample)
    return turned === null ? [] : [turned]
  })
}

/** A challenge is any verdict but Accept; an Accept with a note stays an Accept. */
function challenged(vetter: PairVetter): number {
  return vetter.verdict === "accept" ? 0 : 1
}

type AuditorVetterRow = VetPairRow & {
  ownChallenged: number
  otherChallenged: number
}

/** One row per ordered pair: the vetter on the auditor's model, then the other vetter. */
function auditorVetterRows(
  samples: readonly AuditorVetterSample[],
): AuditorVetterRow[] {
  const rows = new Map<string, AuditorVetterRow>()
  for (const sample of samples) {
    const key = pairKey(sample.own.identity, sample.other.identity)
    const row = rows.get(key) ?? {
      first: sample.own.identity,
      second: sample.other.identity,
      shared: 0,
      ownChallenged: 0,
      otherChallenged: 0,
      splits: 0,
      endings: emptyEndings(),
    }
    rows.set(key, row)
    row.shared += 1
    row.ownChallenged += challenged(sample.own)
    row.otherChallenged += challenged(sample.other)
    if (sample.ruling === null) continue
    row.splits += 1
    row.endings[sample.ruling.ending] += 1
  }
  return sortedPairRows(rows.values())
}

function tierWords(range: TierRange): string {
  return range === "A/B" ? "A or B" : "C"
}

function endingCells(row: RuledPairCounts): string {
  return `${row.splits} | ${row.endings.first} | ${row.endings.second} | ${row.endings.both} | ${row.endings.neither}`
}

const endingColumns =
  "Ruled splits | Auditor as vetter only right | Other only right | Both right | Neither right"

function auditorVetterSection(
  samples: readonly VetPairSample[],
  workClass: WorkClass,
  range: TierRange,
): string[] {
  const rows = auditorVetterRows(
    auditorVetterSamples(samples, workClass, range),
  )
  if (rows.length === 0)
    return [
      `No ${workClass} ${tierWords(range)} finding was judged by a vetter on its auditor's model and effort beside another vetter.`,
    ]
  return [
    `| Auditor as vetter | Other vetter | Shared findings | Challenges by auditor as vetter | Challenges by other vetter | ${endingColumns} |`,
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(modelText(row.first))} | ${escapeCell(modelText(row.second))} | ${row.shared} | ${row.ownChallenged} | ${row.otherChallenged} | ${endingCells(row)} |`,
    ),
  ]
}

function judgeText(judge: RulingJudge): string {
  if (judge.kind === "user") return "user"
  return judge.identity === null
    ? "ruler not recorded"
    : `ruler ${modelText(judge.identity)}`
}

type AuditorJudgeRow = RuledPairCounts & { readonly judge: string }

/**
 * The ruled C splits of each ordered pair, one row per judge. A later ruling
 * comes from the user and replaces the round's judge and ending. Each pair's
 * rows add back to its default row.
 */
function auditorJudgeSection(
  samples: readonly VetPairSample[],
  workClass: WorkClass,
): string[] {
  const rows = new Map<string, AuditorJudgeRow>()
  for (const sample of auditorVetterSamples(samples, workClass, "C")) {
    if (sample.ruling === null) continue
    const judge = judgeText(sample.ruling.judge)
    const key = `${pairKey(sample.own.identity, sample.other.identity)}\u0000${judge}`
    const row = rows.get(key) ?? {
      first: sample.own.identity,
      second: sample.other.identity,
      judge,
      splits: 0,
      endings: emptyEndings(),
    }
    rows.set(key, row)
    row.splits += 1
    row.endings[sample.ruling.ending] += 1
  }
  if (rows.size === 0)
    return [
      `No ${workClass} C finding judged by a vetter on its auditor's model and effort beside another vetter holds a ruled split.`,
    ]
  return [
    `| Auditor as vetter | Other vetter | Judge | ${endingColumns} |`,
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...sortedPairRows(rows.values(), (first, second) =>
      first.judge.localeCompare(second.judge),
    ).map(
      (row) =>
        `| ${escapeCell(modelText(row.first))} | ${escapeCell(modelText(row.second))} | ${escapeCell(row.judge)} | ${endingCells(row)} |`,
    ),
  ]
}

function vetterTimeSection(
  rows: ReadonlyMap<string, VetterTimeRow>,
  workClass: WorkClass,
): string[] {
  const heading = `## ${titleCase(workClass)} vetter times`
  if (rows.size === 0)
    return [heading, "", `No ${workClass} vetter times are recorded.`]
  return [
    heading,
    "",
    "| Vetter | Rounds | Average number of vetters in those rounds | Own average (min) | All vetters in those rounds (min) |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...sortedRows(rows).map(([, row]) => {
      const panelSize = numberText(row.panelRuns / row.rounds)
      const ownTime = numberText(row.ownMilliseconds / row.ownRuns / 60_000)
      const panelTime = numberText(
        row.panelMilliseconds / row.panelRuns / 60_000,
      )
      return `| ${escapeCell(modelText(row.identity))} | ${row.rounds} | ${panelSize} | ${ownTime} | ${panelTime} |`
    }),
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

function partiesCell(parties: readonly RulingParty[], empty: string): string {
  if (parties.length === 0) return empty
  return escapeCell(
    parties
      .map(
        (party) =>
          `${party.role} ${party.identity === null ? "not recorded" : modelText(party.identity)}${party.detail === null ? "" : ` (${party.detail})`}`,
      )
      .join("; "),
  )
}

/** The row cells shared by the user's and the ruler's winner tables. */
function winnerCells(entry: RuledFinding, ruler: readonly string[]): ReasonRow {
  const winners = partiesCell(entry.winners, "none")
  return {
    cells: [
      escapeCell(`${entry.stem}; ${entry.target} round ${entry.round}`),
      escapeCell(`#${entry.finding} ${entry.title}`),
      entry.tier,
      escapeCell(modelText(entry.auditor)),
      vetsCell(entry.vets),
      ...ruler,
      entry.laterWinners === null
        ? winners
        : `**Disproved** ${winners} **Winning** ${partiesCell(entry.laterWinners, "none")}`,
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
      ["Plan and round", "Finding", "Tier", "Auditor", "Vetters", "Winners"],
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
        "Winners",
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

type AuditRulingEvidence = Exclude<
  DisprovedEvidence,
  { kind: "implementation" }
>

function disprovedRow(entry: AuditRulingEvidence): ReasonRow {
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
      partiesCell(entry.wrong, "—"),
      partiesCell(entry.right, "—"),
    ],
    reason: entry.reason,
  }
}

/** The model a table's rows group by: the auditor, or the ruler in a ruler table. */
function disprovedModel(entry: AuditRulingEvidence): string {
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
  const lines = ["## Later rulings", ""]
  if (entries.length === 0) return [...lines, "No later rulings."]
  const auditRulings = entries.filter(
    (entry) => entry.kind !== "implementation",
  )
  let numbered = 0
  for (const [claim, title] of disprovedClaims)
    for (const workClass of ["planning", "implementation"] as const) {
      const rows = auditRulings
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
  const implementation = entries
    .filter((entry) => entry.kind === "implementation")
    .sort(
      (first, second) =>
        modelText(first.coder).localeCompare(modelText(second.coder)) ||
        second.date.localeCompare(first.date) ||
        first.stem.localeCompare(second.stem),
    )
  if (implementation.length > 0) {
    if (lines.length > 2) lines.push("")
    lines.push(
      "### Implementation findings",
      "",
      ...reasonTable(
        ["Date", "Plan", "Tier", "Coder"],
        implementation.map((entry) => ({
          cells: [
            entry.date,
            escapeCell(entry.stem),
            entry.tier,
            escapeCell(modelText(entry.coder)),
          ],
          reason: entry.reason,
        })),
        numbered + 1,
      ),
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

export type ModelsReportOptions = {
  readonly from?: Date
  readonly winners?: boolean
  readonly all?: boolean
}

/** Render the model comparisons and the requested detail tables from retained records. */
export async function modelsReport(
  context: ExecutionContext,
  settings: RoundSettings,
  options: ModelsReportOptions = {},
): Promise<string> {
  const evidence = await readModelEvidence(context, options.from)
  const planning = classRows(evidence.auditors, "planning")
  const implementation = classRows(evidence.auditors, "implementation")
  const coders = admittedCoders(evidence.coders)
  const lines = [
    "# Model read-out",
    "",
    ...(options.from
      ? [
          `Runs from ${format(options.from, "dd-MM-yyyy")} (local midnight).`,
          "",
        ]
      : []),
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
    "A vetter is a model and an effort. Each row counts the findings that both vetters judged on one panel. The highest tier given by the audit report or any vetter determines the section. Ruled splits counts the shared findings where the two vetters split and a winner is stored. The user names the winner on an A or B finding and the ruler on a C finding. The four Split columns show how those ruled splits ended. A winner that names vetters proves them right, and with them every vetter that gave the same accept, drop or referral. A later ruling takes precedence. A wrong finding credits the vetters who dropped it. A finding that stood as written credits the vetters who accepted it. A winning revision credits only its vetter.",
    "",
    ...rangeSections("Planning vetters by auditor", (range) =>
      auditorVetterSection(evidence.vetPairs, "planning", range),
    ),
    ...rangeSections("Implementation vetters by auditor", (range) =>
      auditorVetterSection(evidence.vetPairs, "implementation", range),
    ),
    ...(options.all
      ? [
          "## Planning vetters by auditor and judge, C findings",
          "",
          ...auditorJudgeSection(evidence.vetPairs, "planning"),
          "",
          "## Implementation vetters by auditor and judge, C findings",
          "",
          ...auditorJudgeSection(evidence.vetPairs, "implementation"),
          "",
        ]
      : []),
    `Auditor as vetter ran on the model and effort the round's audit reported, and the other vetter on another model or effort of the same panel. A row counts the findings both judged in that auditor's audit reports, so a row and its reverse show whether the result changes with the auditor. A missing row means no such finding, not a zero. A challenge is a revise, a drop or a referral to the user, and an accept with a note counts as an accept. Ruled splits and their four endings follow the vetter-pair rule above and sum to ruled splits.${options.all ? " The tables by judge group each ruled C split by who named its latest ruling. They show the ruler's recorded model and effort when the ruler decided. A later ruling always counts under the user. The totals add back to the C rows." : ""}`,
    "",
    ...vetterTimeSection(evidence.vetterTimes.planning, "planning"),
    "",
    ...vetterTimeSection(evidence.vetterTimes.implementation, "implementation"),
    "",
    "Each row covers the rounds in which that vetter ran. The last column averages every recorded vetter run in those rounds, including the vetter's own.",
    "",
    ...rangeSections("Coders", (range) => [
      ...coderReading(coders, settings, range),
      "",
      ...coderTable(coders, range),
    ]),
    "Rows sort by the per-step figure, the mean over plans of accepted findings per step, fewest first, then by time. Each section's verdict rests on its own figures. One coder example is one closed plan with a readable model record for every hosted step share, one recorded coder and a complete whole-plan implementation audit after the final step. A ready assignment, when present, must name that coder's assistant and effort. The assignment may be a family alias, so the records name the release. A step without recorded active time uses the span from the ready marker or previous step to its own later share commit, and a plan whose step time cannot be read is excluded. Time adds step time and implementation-round fix time. Planning-round fixes do not enter coder evidence.",
    "",
    ...(options.winners || options.all
      ? [
          ...rulingSection(evidence.rulings, "planning"),
          "",
          ...rulingSection(evidence.rulings, "implementation"),
          "",
          ...rulerSection(evidence.rulerWinners, "planning"),
          "",
          ...rulerSection(evidence.rulerWinners, "implementation"),
          "",
        ]
      : []),
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
