import { isAppError } from "@repo-edu/application-contract"

const DEFAULT_ERROR_MESSAGE = "An unexpected error occurred."

export function getErrorMessage(
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
): string {
  if (isAppError(error) || error instanceof Error) {
    const message = error.message.trim()
    return message.length > 0 ? message : fallback
  }

  if (typeof error === "string") {
    const message = error.trim()
    return message.length > 0 ? message : fallback
  }

  if (error === null || error === undefined) {
    return fallback
  }

  const message = String(error).trim()
  if (message.length === 0 || message === "[object Object]") {
    return fallback
  }

  return message
}
