import { schemeSet3, schemeTableau10 } from "d3-scale-chromatic"

const AUTHOR_PALETTE = [...schemeTableau10, ...schemeSet3]

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
