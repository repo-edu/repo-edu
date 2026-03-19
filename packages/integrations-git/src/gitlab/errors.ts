import { GitbeakerRequestError } from "@gitbeaker/rest"

function gitLabErrorStatus(error: unknown): number | null {
  if (!(error instanceof GitbeakerRequestError)) {
    return null
  }
  const cause = error.cause as { response?: { status?: unknown } } | undefined
  if (typeof cause?.response?.status === "number") {
    return cause.response.status
  }
  return null
}

export function gitLabErrorMessage(error: unknown): string {
  if (error instanceof GitbeakerRequestError) {
    const cause = error.cause as { description?: unknown } | undefined
    if (typeof cause?.description === "string") {
      return cause.description
    }
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function isAlreadyExistsError(error: unknown): boolean {
  const status = gitLabErrorStatus(error)
  if (status !== 400 && status !== 409 && status !== 422) {
    return false
  }
  return /already exists|already been taken|has already been taken/i.test(
    gitLabErrorMessage(error),
  )
}

export function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof GitbeakerRequestError)) {
    return false
  }

  const cause = error.cause as
    | {
        description?: unknown
        response?: { status?: unknown }
      }
    | undefined
  if (cause?.response?.status === 404) {
    return true
  }

  const description =
    typeof cause?.description === "string" ? cause.description : error.message
  return /404|not found/i.test(description)
}

export function isNoChangesMessage(message: string): boolean {
  return /already exists|no commits|no changes|branch.*exists/i.test(message)
}

export function gitLabDataMessage(data: unknown): string {
  if (typeof data === "string") {
    return data
  }
  if (typeof data !== "object" || data === null) {
    return ""
  }
  const record = data as { message?: unknown; error?: unknown }
  if (typeof record.message === "string") {
    return record.message
  }
  if (typeof record.error === "string") {
    return record.error
  }
  try {
    return JSON.stringify(record.message ?? record.error ?? "")
  } catch {
    return ""
  }
}
