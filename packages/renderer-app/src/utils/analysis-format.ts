/**
 * Format an age in seconds to a human-readable Y-M-D string.
 */
export function formatAge(seconds: number): string {
  if (seconds <= 0) return "0d"
  const days = Math.floor(seconds / 86400)
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const remainingDays = days - years * 365 - months * 30
  const parts: string[] = []
  if (years > 0) parts.push(`${years}y`)
  if (months > 0) parts.push(`${months}m`)
  parts.push(`${remainingDays}d`)
  return parts.join(" ")
}

/**
 * Format a Unix timestamp to a relative time string like "Xy Mm Dd ago".
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000
  const diff = now - timestamp
  if (diff <= 0) return "just now"
  return `${formatAge(diff)} ago`
}

/**
 * Format a number to a fixed percentage string.
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Format a number with thousands separator.
 */
export function formatCount(value: number): string {
  return value.toLocaleString()
}
