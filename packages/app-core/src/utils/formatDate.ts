/**
 * Date/time formatting utilities using app display settings.
 */

import type { DateFormat, TimeFormat } from "@repo-edu/backend-interface/types"

/**
 * Format a date string or Date object to date only according to user preferences.
 */
export function formatDate(
  value: string | Date,
  dateFormat: DateFormat,
): string {
  const date = typeof value === "string" ? new Date(value) : value

  if (Number.isNaN(date.getTime())) {
    return "Invalid date"
  }

  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const year = date.getFullYear()

  return dateFormat === "DMY"
    ? `${day}/${month}/${year}`
    : `${month}/${day}/${year}`
}

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

  const datePart = formatDate(date, dateFormat)

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

  return `${datePart}  ${timePart}`
}
