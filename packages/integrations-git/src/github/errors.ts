export function hasGitHubResponse(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "status" in error.response &&
    typeof error.response.status === "number"
  )
}

export function toErrorStatus(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status
  }
  return null
}

export function toErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function isAlreadyExistsError(error: unknown): boolean {
  const status = toErrorStatus(error)
  if (!hasGitHubResponse(error)) return false
  if (status !== 409 && status !== 422) {
    return false
  }
  return /already exists|name already exists/i.test(toErrorMessage(error))
}

export function isNotFoundError(error: unknown): boolean {
  return toErrorStatus(error) === 404
}

export function isNoChangesError(error: unknown): boolean {
  return (
    hasGitHubResponse(error) &&
    /no commits between|no changes|already exists|unprocessable entity/i.test(
      toErrorMessage(error),
    )
  )
}
