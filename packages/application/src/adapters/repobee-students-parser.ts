export type RepoBeeStudentsParseIssue = {
  path: string
  message: string
}

export type RepoBeeStudentsParseResult =
  | { ok: true; teams: string[][] }
  | { ok: false; issues: RepoBeeStudentsParseIssue[] }

const githubUsernamePattern = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

function isValidGitUsername(username: string): boolean {
  return githubUsernamePattern.test(username)
}

export function parseRepoBeeStudentsText(
  text: string,
): RepoBeeStudentsParseResult {
  const lines = text.split(/\r?\n/)
  const teams: string[][] = []
  const issues: RepoBeeStudentsParseIssue[] = []

  for (const [lineIndex, line] of lines.entries()) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      continue
    }

    const rawUsernames = trimmed.split(/\s+/)
    const normalized = rawUsernames
      .map(normalizeUsername)
      .filter((username) => username.length > 0)

    if (normalized.length === 0) {
      issues.push({
        path: `line.${lineIndex + 1}`,
        message: `Line ${lineIndex + 1} has no usernames.`,
      })
      continue
    }

    const seen = new Set<string>()
    const validUsernames: string[] = []
    for (const username of normalized) {
      if (!isValidGitUsername(username)) {
        issues.push({
          path: `line.${lineIndex + 1}`,
          message: `Invalid username '${username}' on line ${
            lineIndex + 1
          }. Usernames must be 1-39 chars of letters/numbers with single internal hyphens.`,
        })
        continue
      }

      if (!seen.has(username)) {
        seen.add(username)
        validUsernames.push(username)
        continue
      }
      issues.push({
        path: `line.${lineIndex + 1}`,
        message: `Duplicate normalized username '${username}' on line ${lineIndex + 1}.`,
      })
    }

    if (validUsernames.length === 0) {
      continue
    }

    teams.push(validUsernames.sort((left, right) => left.localeCompare(right)))
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  if (teams.length === 0) {
    return {
      ok: false,
      issues: [{ path: "$", message: "RepoBee students file has no teams." }],
    }
  }

  return { ok: true, teams }
}
