import type { AppError, Result } from "../bindings"

/**
 * Unwrap a Tauri command result, throwing the error if it failed.
 * Eliminates repetitive error handling boilerplate in service functions.
 */
export function unwrap<T>(result: Result<T, AppError>): T {
  if (result.status === "error") throw result.error
  return result.data
}

// Temporary helper: specta currently emits optional fields in generated TS.
// Wrap command param/result types with Strict<...> to enforce required fields at call sites.
// Remove this helper (and the wraps) when specta/tauri-specta emit required fields correctly.
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
