import type { AppError, Result } from "../bindings/types"

/**
 * Unwrap a Tauri command result, throwing the error if it failed.
 * Eliminates repetitive error handling boilerplate in service functions.
 */
export function unwrap<T>(result: Result<T, AppError>): T {
  if (result.status === "error") throw result.error
  return result.data
}

// Temporary helper: generated schema types may allow optional fields in params.
// Wrap command param/result types with Strict<...> to enforce required fields at call sites.
export type Strict<T> = { [K in keyof T]-?: T[K] }

/**
 * Type guard to check if an error is an AppError.
 */
export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as AppError).message === "string"
  )
}

/**
 * Extract error message and optional details from an unknown error.
 */
export function formatError(error: unknown): {
  message: string
  details?: string
} {
  if (isAppError(error)) {
    return { message: error.message, details: error.details ?? undefined }
  }
  if (error instanceof Error) {
    return { message: error.message }
  }
  return { message: String(error) }
}

/**
 * Convert an error message to a short user-friendly summary for inline UI display.
 * Use this when space is limited (e.g., form field hints).
 */
export function toShortErrorMessage(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes("permission") || lower.includes("forbidden")) {
    return "Insufficient permissions"
  }
  if (lower.includes("not found") || lower.includes("404")) {
    return "Not found"
  }
  if (lower.includes("unauthorized") || lower.includes("401")) {
    return "Invalid credentials"
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Request timed out"
  }
  if (lower.includes("network") || lower.includes("connection")) {
    return "Network error"
  }
  return "Failed to load"
}
