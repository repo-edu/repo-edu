import { schemeSet3 } from "d3-scale-chromatic"

const AUTHOR_PALETTE = [
  "#76b7b2", // teal
  "#4e79a7", // blue
  "#af7aaa", // purple
  "#59a14f", // green
  "#ff9da7", // pink
  "#edc949", // yellow
  "#f28e2c", // orange
  "#e15759", // red
  ...schemeSet3,
  "#9c755f", // brown
  "#bab0ab", // grey
]

export function authorColor(index: number): string {
  return AUTHOR_PALETTE[index % AUTHOR_PALETTE.length]
}

export function authorColorMap(
  stats: readonly { personId: string; lines: number }[],
): Map<string, string> {
  const ranked = [...stats].sort((a, b) => {
    if (b.lines !== a.lines) return b.lines - a.lines
    return a.personId.localeCompare(b.personId)
  })
  const map = new Map<string, string>()
  for (let i = 0; i < ranked.length; i++) {
    map.set(ranked[i].personId, authorColor(i))
  }
  return map
}
