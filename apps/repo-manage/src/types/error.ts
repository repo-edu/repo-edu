/**
 * Unified error type from Tauri commands
 * Matches the Rust AppError struct in src-tauri/src/error.rs
 */
export interface AppError {
  /** User-friendly error message */
  message: string;
  /** Optional technical details for debugging */
  details?: string;
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as AppError).message === "string"
  );
}

/**
 * Extract user-friendly message from any error
 * Handles both AppError and plain strings/errors
 */
export function getErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
