export type Violation = {
  readonly file: string
  readonly message: string
}

export function compareViolations(left: Violation, right: Violation): number {
  if (left.file !== right.file) return left.file.localeCompare(right.file)
  return left.message.localeCompare(right.message)
}
