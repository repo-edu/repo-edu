const numberFormatter = new Intl.NumberFormat("en-US")

export function formatLinesShort(lines: number): string {
  return lines >= 1000 ? `${(lines / 1000).toFixed(1)}k` : String(lines)
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}
