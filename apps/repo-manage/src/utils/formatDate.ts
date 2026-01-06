/**
 * Date/time formatting utilities using app display settings.
 */

import type { DateFormat, TimeFormat } from "../bindings/types"

/**
 * Format a date string or Date object according to user preferences.
 */
export function formatDateTime(
  value: string | Date,
  dateFormat: DateFormat,
  timeFormat: TimeFormat,
): string {
  const date = typeof value === "string" ? new Date(value) : value

  if (Number.isNaN(date.getTime())) {
    return "Invalid date"
  }

  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const year = date.getFullYear()

  const datePart =
    dateFormat === "DMY" ? `${day}/${month}/${year}` : `${month}/${day}/${year}`

  const hours24 = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")

  let timePart: string
  if (timeFormat === "24h") {
    timePart = `${hours24.toString().padStart(2, "0")}:${minutes}`
  } else {
    const hours12 = hours24 % 12 || 12
    const ampm = hours24 < 12 ? "AM" : "PM"
    timePart = `${hours12}:${minutes} ${ampm}`
  }

  return `${datePart}, ${timePart}`
}
