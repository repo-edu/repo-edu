import type { SortingState } from "@tanstack/react-table"

const textCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

function normalizeSortingEntries(sorting: SortingState): SortingState {
  const next: SortingState = []
  const seen = new Set<string>()

  for (const entry of sorting) {
    if (!entry?.id || seen.has(entry.id)) continue
    seen.add(entry.id)
    next.push({ id: entry.id, desc: Boolean(entry.desc) })
    if (next.length === 2) break
  }

  return next
}

export function normalizeProgressiveSorting(
  sorting: SortingState,
): SortingState {
  return normalizeSortingEntries(sorting)
}

export function getNextProgressiveSorting(
  sorting: SortingState,
  columnId: string,
): SortingState {
  const [primary, secondary] = normalizeSortingEntries(sorting)

  if (primary?.id === columnId) {
    return [
      { id: columnId, desc: !primary.desc },
      ...(secondary ? [secondary] : []),
    ]
  }

  return [
    { id: columnId, desc: false },
    ...(primary && primary.id !== columnId ? [primary] : []),
  ]
}

function normalizeTextValue(value: string | null | undefined): string {
  return (value ?? "").trim()
}

export function compareText(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  return textCollator.compare(
    normalizeTextValue(left),
    normalizeTextValue(right),
  )
}

export function compareNullableText(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  return compareText(left, right)
}

export function compareNumber(left: number, right: number): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

export function compareBoolean(left: boolean, right: boolean): number {
  return compareNumber(Number(left), Number(right))
}

export function chainComparisons(...comparisons: number[]): number {
  for (const comparison of comparisons) {
    if (comparison !== 0) return comparison
  }
  return 0
}
