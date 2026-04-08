import type { BlameLine, FileBlame } from "@repo-edu/domain/analysis"

// ---------------------------------------------------------------------------
// Porcelain blame parsing
// ---------------------------------------------------------------------------

const OID_LINE_RE = /^([a-f0-9]{40}) (\d+) (\d+)/

/**
 * Parses `git blame --porcelain` output into a {@link FileBlame}.
 *
 * Porcelain format emits blocks per source line:
 * ```
 * <40-hex-oid> <orig-line> <final-line> [<group-count>]
 * author <name>
 * author-mail <<email>>
 * author-time <unix-timestamp>
 * ...
 * summary <message>
 * filename <path>
 * \t<code-line>
 * ```
 *
 * For subsequent lines from the same commit, only the OID line and code
 * line are emitted (no metadata block). We cache metadata by OID.
 */
export function parseBlameOutput(filePath: string, stdout: string): FileBlame {
  const lines: BlameLine[] = []

  if (stdout.trim().length === 0) {
    return { path: filePath, lines }
  }

  const rawLines = stdout.split("\n")

  // Cache metadata by OID to handle repeated OID blocks
  const oidMeta = new Map<
    string,
    {
      authorName: string
      authorEmail: string
      timestamp: number
      message: string
    }
  >()

  let currentOid = ""
  let currentLineNumber = 0
  let meta: {
    authorName: string
    authorEmail: string
    timestamp: number
    message: string
  } = {
    authorName: "",
    authorEmail: "",
    timestamp: 0,
    message: "",
  }
  let isNewOid = false

  for (const line of rawLines) {
    // OID header line
    const oidMatch = OID_LINE_RE.exec(line)
    if (oidMatch) {
      currentOid = oidMatch[1]
      currentLineNumber = Number.parseInt(oidMatch[3], 10)

      const cached = oidMeta.get(currentOid)
      if (cached) {
        meta = cached
        isNewOid = false
      } else {
        meta = {
          authorName: "",
          authorEmail: "",
          timestamp: 0,
          message: "",
        }
        isNewOid = true
      }
      continue
    }

    // Metadata lines (only present for first occurrence of each OID)
    if (line.startsWith("author ")) {
      meta.authorName = line.slice(7)
      continue
    }
    if (line.startsWith("author-mail ")) {
      // Strip angle brackets: <email> → email
      meta.authorEmail = line.slice(12).replace(/^<|>$/g, "")
      continue
    }
    if (line.startsWith("author-time ")) {
      meta.timestamp = Number.parseInt(line.slice(12), 10)
      continue
    }
    if (line.startsWith("summary ")) {
      meta.message = line.slice(8)
      continue
    }
    if (line.startsWith("filename ")) {
      // Last metadata line before code — cache the metadata
      if (isNewOid) {
        oidMeta.set(currentOid, { ...meta })
        isNewOid = false
      }
      continue
    }

    // Code line: starts with a tab character
    if (line.startsWith("\t")) {
      lines.push({
        sha: currentOid,
        authorName: meta.authorName,
        authorEmail: meta.authorEmail,
        timestamp: meta.timestamp,
        lineNumber: currentLineNumber,
        content: line.slice(1), // strip leading tab
        message: meta.message,
      })
    }

    // Skip other metadata lines (committer-*, boundary, previous, etc.)
  }

  return { path: filePath, lines }
}
