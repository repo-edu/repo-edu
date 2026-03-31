export function normalizeName(value: string): string {
  return value.trim().split(/\s+/).join(" ").toLowerCase()
}
