import { mean } from "simple-statistics"

const yieldSame = 0.05
const yieldClear = 0.5
const timeClear = 2

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
  readonly ownPerRound: number | null
  readonly otherFindings: number
  readonly otherRounds: number
  readonly otherPerRound: number | null
  readonly openedPlans: number
  readonly evenOpenedPlans: number
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

/**
 * Compare one auditor with every other auditor on the plans they share. Each
 * side's figure divides its kept findings by its rounds over all those plans.
 */
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
  let plans = 0
  let openedPlans = 0
  let evenOpenedPlans = 0

  for (const [plan, own] of ownByPlan) {
    const otherGroups = othersByAuditor.flatMap((auditor) => {
      const samples = auditor.get(plan)
      return samples === undefined ? [] : [samples]
    })
    if (otherGroups.length === 0) continue
    const others = otherGroups.flat()
    plans += 1
    ownFindings += own.reduce((total, sample) => total + sample.yield, 0)
    ownRounds += own.length
    otherFindings += others.reduce((total, sample) => total + sample.yield, 0)
    otherRounds += others.length
    if (own.some((sample) => sample.first)) openedPlans += 1
    evenOpenedPlans += 1 / (otherGroups.length + 1)
  }

  return {
    plans,
    ownFindings,
    ownRounds,
    ownPerRound: plans === 0 ? null : ownFindings / ownRounds,
    otherFindings,
    otherRounds,
    otherPerRound: plans === 0 ? null : otherFindings / otherRounds,
    openedPlans,
    evenOpenedPlans,
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
