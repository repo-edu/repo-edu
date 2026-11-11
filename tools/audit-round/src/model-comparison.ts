import { mean } from "simple-statistics"

const yieldSame = 0.05
const yieldClear = 0.5
const timeClear = 2
const auditorYieldFactor = 1.25

export const auditorFloor = 5
export const coderFloor = 3

export type ReadingSample = {
  readonly yield: number
  readonly minutes: number
}

export type YieldSample = Pick<ReadingSample, "yield">
export type TimeSample = Pick<ReadingSample, "minutes">

export type AuditorPlanSample = ReadingSample & {
  readonly plan: string
  readonly first: boolean
}

export type AuditorPlanComparison = {
  readonly plans: number
  readonly ownFindings: number
  readonly ownRounds: number
  readonly ownAverage: number | null
  readonly otherFindings: number
  readonly otherRounds: number
  readonly otherAverage: number | null
  readonly openedPlans: number
  readonly evenOpenedPlans: number
}

type AuditorGroup<Row> = {
  readonly more: Row[]
  readonly fewer: Row[]
}

type TimeGroup<Row> = {
  readonly fastest: Row | null
  readonly slower: Row[]
}

function samplesByPlan(
  samples: readonly AuditorPlanSample[],
): ReadonlyMap<string, readonly AuditorPlanSample[]> {
  const grouped = new Map<string, AuditorPlanSample[]>()
  for (const sample of samples) {
    const plan = grouped.get(sample.plan) ?? []
    plan.push(sample)
    grouped.set(sample.plan, plan)
  }
  return grouped
}

/** Compare one auditor with every other auditor on the plans they share. */
export function compareAuditorPlans(
  ownSamples: readonly AuditorPlanSample[],
  otherAuditors: readonly (readonly AuditorPlanSample[])[],
): AuditorPlanComparison {
  const ownByPlan = samplesByPlan(ownSamples)
  const othersByAuditor = otherAuditors.map(samplesByPlan)
  let ownFindings = 0
  let ownRounds = 0
  let otherFindings = 0
  let otherRounds = 0
  let openedPlans = 0
  let evenOpenedPlans = 0
  const ownPlanYields: number[] = []
  const otherPlanYields: number[] = []

  for (const [plan, own] of ownByPlan) {
    const otherGroups = othersByAuditor.flatMap((auditor) => {
      const samples = auditor.get(plan)
      return samples === undefined ? [] : [samples]
    })
    if (otherGroups.length === 0) continue
    const others = otherGroups.flat()
    const ownKept = own.reduce((total, sample) => total + sample.yield, 0)
    const otherKept = others.reduce((total, sample) => total + sample.yield, 0)
    ownFindings += ownKept
    ownRounds += own.length
    otherFindings += otherKept
    otherRounds += others.length
    ownPlanYields.push(ownKept / own.length)
    otherPlanYields.push(otherKept / others.length)
    if (own.some((sample) => sample.first)) openedPlans += 1
    evenOpenedPlans += 1 / (otherGroups.length + 1)
  }

  return {
    plans: ownPlanYields.length,
    ownFindings,
    ownRounds,
    ownAverage: ownPlanYields.length === 0 ? null : mean(ownPlanYields),
    otherFindings,
    otherRounds,
    otherAverage: otherPlanYields.length === 0 ? null : mean(otherPlanYields),
    openedPlans,
    evenOpenedPlans,
  }
}

/** Group admitted auditor rows by their yield against the other auditors. */
export function auditorYieldGroups<Row>(
  rows: readonly Row[],
  comparison: (row: Row) => AuditorPlanComparison,
): AuditorGroup<Row> {
  const more: Row[] = []
  const fewer: Row[] = []
  for (const row of rows) {
    const { ownAverage, otherAverage } = comparison(row)
    if (ownAverage === null || otherAverage === null) continue
    if (ownAverage === 0 && otherAverage === 0) continue
    if (ownAverage >= otherAverage * auditorYieldFactor) more.push(row)
    if (otherAverage >= ownAverage * auditorYieldFactor) fewer.push(row)
  }
  return { more, fewer }
}

/** Find the fastest row and rows taking more than twice its mean time. */
export function auditorTimeGroup<Row>(
  rows: readonly Row[],
  minutes: (row: Row) => number,
): TimeGroup<Row> {
  if (rows.length === 0) return { fastest: null, slower: [] }
  const ordered = [...rows].sort((first, second) => {
    const difference = minutes(first) - minutes(second)
    return difference === 0 ? 0 : difference
  })
  const fastest = ordered[0]
  return {
    fastest,
    slower: ordered
      .slice(1)
      .filter((row) => minutes(row) > minutes(fastest) * 2),
  }
}

/** Whether the opener count is outside both the proportional and count bounds. */
export function hasUnevenOpeners(comparison: AuditorPlanComparison): boolean {
  const difference = Math.abs(
    comparison.openedPlans - comparison.evenOpenedPlans,
  )
  const roundingMargin = Number.EPSILON * comparison.plans
  return difference > comparison.plans / 10 && difference >= 2 - roundingMargin
}

function timeFactor(first: number, second: number): number {
  const lower = Math.min(first, second)
  const upper = Math.max(first, second)
  if (upper === 0) return 1
  if (lower === 0) return Number.POSITIVE_INFINITY
  return upper / lower
}

function clearYieldLeader(
  first: readonly YieldSample[],
  second: readonly YieldSample[],
  moreIsBetter: boolean,
): boolean {
  const firstMean = mean(first.map((sample) => sample.yield))
  const secondMean = mean(second.map((sample) => sample.yield))
  if (
    moreIsBetter
      ? firstMean - secondMean < yieldClear
      : secondMean - firstMean < yieldClear
  )
    return false
  const firstYields = first.map((sample) => sample.yield)
  const secondYields = second.map((sample) => sample.yield)
  return moreIsBetter
    ? Math.min(...firstYields) > Math.max(...secondYields)
    : Math.max(...firstYields) < Math.min(...secondYields)
}

function clearTimeLeader(
  first: readonly TimeSample[],
  second: readonly TimeSample[],
): boolean {
  const firstMean = mean(first.map((sample) => sample.minutes))
  const secondMean = mean(second.map((sample) => sample.minutes))
  return (
    timeFactor(firstMean, secondMean) >= timeClear &&
    firstMean < secondMean &&
    Math.max(...first.map((sample) => sample.minutes)) <
      Math.min(...second.map((sample) => sample.minutes))
  )
}

/** Whether one row has a clear lead without a clear yield-against-time trade. */
export function clearlyPreferred(
  first: readonly ReadingSample[],
  second: readonly ReadingSample[],
  moreYieldIsBetter: boolean,
): boolean {
  return clearlyPreferredMeasures(
    first,
    second,
    first,
    second,
    moreYieldIsBetter,
  )
}

/** Whether separate yield and time evidence gives one row a clear lead. */
export function clearlyPreferredMeasures(
  firstYield: readonly YieldSample[],
  secondYield: readonly YieldSample[],
  firstTime: readonly TimeSample[],
  secondTime: readonly TimeSample[],
  moreYieldIsBetter: boolean,
): boolean {
  if (
    firstYield.length === 0 ||
    secondYield.length === 0 ||
    firstTime.length === 0 ||
    secondTime.length === 0
  )
    return false
  if (clearYieldLeader(firstYield, secondYield, moreYieldIsBetter))
    return !clearTimeLeader(secondTime, firstTime)
  const yieldsMatch =
    Math.abs(
      mean(firstYield.map((sample) => sample.yield)) -
        mean(secondYield.map((sample) => sample.yield)),
    ) < yieldSame
  return yieldsMatch && clearTimeLeader(firstTime, secondTime)
}
