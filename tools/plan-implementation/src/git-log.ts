import { PlanRecordError } from "./plan-record-error.js"

const fullObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

export type GitCommitFields = {
  readonly commitOid: string
  readonly subject: string
  readonly body: string
}

export function parseZeroSeparatedGitLog(
  output: Buffer,
): readonly GitCommitFields[] {
  if (output.length === 0) {
    return []
  }
  const fields = output.toString("utf8").split("\0")
  if (fields.pop() !== "" || fields.length % 3 !== 0) {
    throw new PlanRecordError(
      "Git history did not contain complete zero-separated commit fields.",
    )
  }

  const commits: GitCommitFields[] = []
  for (let index = 0; index < fields.length; index += 3) {
    let commitOid = fields[index]
    if (index > 0) {
      if (!commitOid.startsWith("\n")) {
        throw new PlanRecordError(
          "Git history did not separate formatted commits with one newline.",
        )
      }
      commitOid = commitOid.slice(1)
    }
    if (!fullObjectIdPattern.test(commitOid)) {
      throw new PlanRecordError(
        "The history commit ID must be a full lowercase Git object ID.",
      )
    }
    const subject = fields[index + 1]
    if (subject.length === 0 || /[\r\n\0]/.test(subject)) {
      throw new PlanRecordError(
        "The history commit subject must be one non-empty line.",
      )
    }
    commits.push({ commitOid, subject, body: fields[index + 2] })
  }
  return commits
}
