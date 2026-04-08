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
export const LOG_PRETTY_FORMAT = `${COMMIT_DELIMITER}%x00%h%x00%ct%x00%aN%x00%aE%x00%B`

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

    // Each chunk starts with \0 then fields separated by \0:
    // \0<sha>\0<timestamp>\0<authorName>\0<authorEmail>\0<message>
    // followed by numstat lines (each path NUL-terminated by -z)
    const parts = chunk.split("\0")

    // parts[0] is empty (before first \0), then sha, ct, aN, aE, message
    if (parts.length < 6) {
      continue
    }

    const sha = parts[1].trim()
    const timestamp = Number.parseInt(parts[2], 10)
    const authorName = parts[3]
    const authorEmail = parts[4]
    const message = parts[5]

    if (!sha || Number.isNaN(timestamp)) {
      continue
    }

    const files: AnalysisCommit["files"] = []

    // The format after the message is alternating "ins\tdel" and "path".
    const numstatParts = parts.slice(6)

    // Parse numstat entries: alternating pattern of "ins\tdel" and "path"
    let i = 0
    while (i < numstatParts.length) {
      const current = numstatParts[i]

      // Look for numstat pattern: digits/dash TAB digits/dash
      const numstatMatch = /(-?\d+|-)\t(-?\d+|-)\s*$/.exec(current)
      if (numstatMatch && i + 1 < numstatParts.length) {
        const rawInsertions = numstatMatch[1]
        const rawDeletions = numstatMatch[2]

        // Binary files use "-" for both insertions and deletions
        const insertions =
          rawInsertions === "-" ? 0 : Number.parseInt(rawInsertions, 10)
        const deletions =
          rawDeletions === "-" ? 0 : Number.parseInt(rawDeletions, 10)

        const rawPath = numstatParts[i + 1]
        const path = resolveRenamedPath(rawPath.trim())

        if (path.length > 0) {
          files.push({
            path,
            insertions: Number.isNaN(insertions) ? 0 : insertions,
            deletions: Number.isNaN(deletions) ? 0 : deletions,
          })
        }

        i += 2
      } else {
        // Skip parts that don't match numstat pattern
        i++
      }
    }

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
