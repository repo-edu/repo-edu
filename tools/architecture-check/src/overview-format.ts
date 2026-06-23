export function formatLinesShort(lines: number): string {
  return lines >= 1000 ? `${(lines / 1000).toFixed(1)}k` : String(lines)
}
