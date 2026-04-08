/**
 * 20-color palette for author differentiation (Tauri improvement over Python's 9).
 * Colors are chosen for legibility on both light and dark backgrounds.
 */
const AUTHOR_PALETTE = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
  "#af7aa1",
  "#86bcb6",
  "#d37295",
  "#fabfd2",
  "#b6992d",
  "#499894",
  "#e17a52",
  "#d4a6c8",
  "#8cd17d",
  "#a0cbe8",
] as const

export function authorColor(index: number): string {
  return AUTHOR_PALETTE[index % AUTHOR_PALETTE.length]
}

export function authorColorMap(personIds: string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (let i = 0; i < personIds.length; i++) {
    map.set(personIds[i], authorColor(i))
  }
  return map
}
