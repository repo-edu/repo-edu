import type { AnalysisCommit } from "@repo-edu/domain/analysis"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Delimiter placed in `--pretty=format` to unambiguously separate commit
 * headers from numstat output when using `-z` framing. Chosen to be
 * impossible in any real commit field.
 */
export const COMMIT_DELIMITER = "---commit-boundary---"

/**
 * Pretty format string for per-file `git log --follow --numstat -z`.
 *
 * Fields: short hash, committer timestamp, author name, author email,
 * then full commit message body (`%B`).
 *
 * `%x00` emits a NUL byte as field separator inside the format string.
 * Combined with `-z` (which NUL-terminates each numstat path), this gives
 * fully unambiguous parsing regardless of filenames.
 */
export const LOG_PRETTY_FORMAT = `${COMMIT_DELIMITER}%x00%h%x00%ct%x00%aN%x00%aE%x00%B%x00`

// ---------------------------------------------------------------------------
// Rename resolution
// ---------------------------------------------------------------------------

const BRACE_RENAME_RE = /^(.*)\{(.*) => (.*)\}(.*)$/
const SIMPLE_RENAME_RE = /^(.*) => (.*)$/

/**
 * Resolves a potentially renamed filename from numstat output to its
 * current path. Git encodes renames in two forms:
 *
 * 1. `prefix{old => new}suffix` — partial rename within a directory
 * 2. `old => new`               — full path rename
 *
 * Returns the *new* (current) path in both cases. Non-rename paths are
 * returned as-is.
 */
export function resolveRenamedPath(raw: string): string {
  const braceMatch = BRACE_RENAME_RE.exec(raw)
  if (braceMatch) {
    const [, prefix, , newPart, suffix] = braceMatch
    return `${prefix}${newPart}${suffix}`.replace(/\/\//g, "/")
  }

  const simpleMatch = SIMPLE_RENAME_RE.exec(raw)
  if (simpleMatch) {
    return simpleMatch[2]
  }

  return raw
}

// ---------------------------------------------------------------------------
// Log parsing
// ---------------------------------------------------------------------------

/**
 * Parses the combined stdout of `git log --follow --numstat -z` with the
 * pretty format defined by {@link LOG_PRETTY_FORMAT}.
 *
 * The `-z` flag NUL-terminates each numstat file path. The custom delimiter
 * separates commit headers from numstat lines, making parsing robust
 * against filenames with special characters.
 *
 * Binary files produce numstat lines with `-\t-\tfilename` — these are
 * included with insertions=0 and deletions=0 (Python crashes here with
 * `int("-")` ValueError; we handle gracefully).
 */
export function parseLogOutput(stdout: string): AnalysisCommit[] {
  if (stdout.trim().length === 0) {
    return []
  }

  const commits: AnalysisCommit[] = []

  // Split on the commit delimiter. First element is empty or whitespace.
  const chunks = stdout.split(COMMIT_DELIMITER)

  for (const chunk of chunks) {
    if (chunk.trim().length === 0) {
      continue
    }

    let cursor = chunk.startsWith("\0") ? 1 : 0

    const shaResult = readNulField(chunk, cursor)
    if (!shaResult) {
      continue
    }
    const sha = shaResult.value.trim()
    cursor = shaResult.next

    const timestampResult = readNulField(chunk, cursor)
    if (!timestampResult) {
      continue
    }
    const timestamp = Number.parseInt(timestampResult.value, 10)
    cursor = timestampResult.next

    const authorNameResult = readNulField(chunk, cursor)
    if (!authorNameResult) {
      continue
    }
    const authorName = authorNameResult.value
    cursor = authorNameResult.next

    const authorEmailResult = readNulField(chunk, cursor)
    if (!authorEmailResult) {
      continue
    }
    const authorEmail = authorEmailResult.value
    cursor = authorEmailResult.next

    if (!sha || Number.isNaN(timestamp)) {
      continue
    }

    const remainder = chunk.slice(cursor)
    const { message: rawMessage, numstatRaw } =
      splitMessageAndNumstat(remainder)
    const message = rawMessage.replace(/\n+$/, "")
    const files = parseNumstatFiles(numstatRaw)

    commits.push({
      sha,
      authorName,
      authorEmail,
      timestamp,
      message,
      files,
    })
  }

  return commits
}

function readNulField(
  value: string,
  start: number,
): { value: string; next: number } | null {
  const separator = value.indexOf("\0", start)
  if (separator === -1) {
    return null
  }
  return {
    value: value.slice(start, separator),
    next: separator + 1,
  }
}

function isLikelyNumstatStart(value: string): boolean {
  const candidate = value.replace(/^\n+/, "")
  return /^(-?\d+|-)\t(-?\d+|-)(\t|\0|$)/.test(candidate)
}

function splitMessageAndNumstat(raw: string): {
  message: string
  numstatRaw: string
} {
  if (raw.length === 0) {
    return { message: "", numstatRaw: "" }
  }

  const newlineIndex = raw.indexOf("\n")
  const nulIndex = raw.indexOf("\0")
  const separatorCandidates = [newlineIndex, nulIndex]
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)

  for (const separatorIndex of separatorCandidates) {
    const after = raw.slice(separatorIndex + 1)
    if (after.length === 0 || isLikelyNumstatStart(after)) {
      return {
        message: raw.slice(0, separatorIndex),
        numstatRaw: after,
      }
    }
  }

  return { message: raw, numstatRaw: "" }
}

function parseNumstatFiles(numstatRaw: string): AnalysisCommit["files"] {
  if (numstatRaw.trim().length === 0) {
    return []
  }

  const files: AnalysisCommit["files"] = []
  const parts = numstatRaw.split("\0")
  let index = 0

  while (index < parts.length) {
    let current = parts[index]
    if (current.length === 0) {
      index++
      continue
    }

    current = current.replace(/^\n+/, "").replace(/[\r\n ]+$/, "")
    if (current.length === 0) {
      index++
      continue
    }

    const inlinePathMatch = /^(-?\d+|-)\t(-?\d+|-)\t(.*)$/.exec(current)
    if (inlinePathMatch) {
      const rawInsertions = inlinePathMatch[1]
      const rawDeletions = inlinePathMatch[2]
      let rawPath = inlinePathMatch[3].trim()

      if (rawPath.length === 0) {
        const oldPath = (parts[index + 1] ?? "").trim()
        const newPath = (parts[index + 2] ?? "").trim()
        rawPath = newPath || oldPath
        index += 3
      } else {
        index += 1
      }

      const path = resolveRenamedPath(rawPath)
      if (path.length > 0) {
        files.push({
          path,
          insertions: parseNumstatNumber(rawInsertions),
          deletions: parseNumstatNumber(rawDeletions),
        })
      }
      continue
    }

    const splitPathMatch = /^(-?\d+|-)\t(-?\d+|-)$/.exec(current)
    if (splitPathMatch) {
      const rawInsertions = splitPathMatch[1]
      const rawDeletions = splitPathMatch[2]
      const rawPath = (parts[index + 1] ?? "").trim()
      const path = resolveRenamedPath(rawPath)
      if (path.length > 0) {
        files.push({
          path,
          insertions: parseNumstatNumber(rawInsertions),
          deletions: parseNumstatNumber(rawDeletions),
        })
      }
      index += 2
      continue
    }

    index += 1
  }

  return files
}

function parseNumstatNumber(value: string): number {
  if (value === "-") {
    return 0
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}
