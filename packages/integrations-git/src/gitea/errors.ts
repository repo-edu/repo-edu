export function toErrorMessage(data: unknown): string {
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
  return ""
}

export function isAlreadyExists(status: number, data: unknown): boolean {
  if (status !== 409 && status !== 422) {
    return false
  }
  return /already exists|has already been taken/i.test(toErrorMessage(data))
}

export function isNoChangesMessage(message: string): boolean {
  return /already exists|no commits|no changes|same as current/i.test(message)
}
