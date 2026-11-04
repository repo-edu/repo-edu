import { mean, standardDeviation } from "simple-statistics"

const yieldSame = 0.05
const yieldClear = 0.5
const timeSame = 1.05
const timeMarginal = 1.25
const timeClear = 2

export const auditorFloor = 5
export const coderFloor = 3

export type ReadingSample = {
  readonly yield: number
  readonly minutes: number
}

export type YieldSample = Pick<ReadingSample, "yield">
export type TimeSample = Pick<ReadingSample, "minutes">

function timeFactor(first: number, second: number): number {
  const lower = Math.min(first, second)
  const upper = Math.max(first, second)
  if (upper === 0) return 1
  if (lower === 0) return Number.POSITIVE_INFINITY
  return upper / lower
}

/** Plain graded words for the first yield relative to the second. */
export function yieldWords(first: number, second: number): string {
  const gap = Math.abs(first - second)
  if (gap < yieldSame) return "the same yield"
  const grade = gap < 0.25 ? "marginally" : gap < yieldClear ? "" : "much"
  return `${grade.length === 0 ? "" : `${grade} `}${first > second ? "higher" : "lower"} yield`
}

/** Plain graded words for the first elapsed time relative to the second. */
export function speedWords(first: number, second: number): string {
  const factor = timeFactor(first, second)
  if (factor < timeSame) return "the same speed"
  const grade =
    factor < timeMarginal ? "marginally" : factor < timeClear ? "" : "much"
  return `${grade.length === 0 ? "" : `${grade} `}${first < second ? "faster" : "slower"}`
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

/** Whether the first coder's spread or worst observed plan is less reliable. */
export function coderReliabilityDisadvantages(
  first: readonly YieldSample[],
  second: readonly YieldSample[],
): { readonly spread: boolean; readonly worst: boolean } {
  return {
    spread:
      standardDeviation(first.map((sample) => sample.yield)) >
      standardDeviation(second.map((sample) => sample.yield)),
    worst:
      Math.max(...first.map((sample) => sample.yield)) >
      Math.max(...second.map((sample) => sample.yield)),
  }
}
