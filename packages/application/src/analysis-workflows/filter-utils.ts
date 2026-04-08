// ---------------------------------------------------------------------------
// Case-insensitive fnmatch/glob pattern matching (Python parity)
// ---------------------------------------------------------------------------

/**
 * Converts an fnmatch/glob pattern to a case-insensitive regex.
 *
 * Supported syntax:
 * - `*` — matches any sequence (except path separator in strict mode,
 *   but Python's fnmatch matches across `/` so we do too)
 * - `?` — matches any single character
 * - `[seq]` / `[!seq]` — character class
 * - All other characters are escaped
 */
function fnmatchToRegex(pattern: string): RegExp {
  let regex = ""
  let i = 0

  while (i < pattern.length) {
    const char = pattern[i]

    if (char === "*") {
      regex += "[\\s\\S]*"
    } else if (char === "?") {
      regex += "[\\s\\S]"
    } else if (char === "[") {
      // Character class — find closing bracket
      let j = i + 1
      // Handle negation
      if (j < pattern.length && pattern[j] === "!") {
        j++
      }
      // Handle literal ] at start
      if (j < pattern.length && pattern[j] === "]") {
        j++
      }
      while (j < pattern.length && pattern[j] !== "]") {
        j++
      }
      if (j >= pattern.length) {
        // No closing bracket — treat as literal
        regex += escapeRegex(char)
      } else {
        let classBody = pattern.slice(i + 1, j)
        if (classBody.startsWith("!")) {
          classBody = `^${classBody.slice(1)}`
        }
        regex += `[${classBody}]`
        i = j
      }
    } else {
      regex += escapeRegex(char)
    }

    i++
  }

  return new RegExp(`^${regex}$`, "i")
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Pattern cache to avoid recompiling
const patternCache = new Map<string, RegExp>()

function getCachedRegex(pattern: string): RegExp {
  let cached = patternCache.get(pattern)
  if (!cached) {
    cached = fnmatchToRegex(pattern)
    patternCache.set(pattern, cached)
  }
  return cached
}

/**
 * Tests whether a value matches any of the given fnmatch/glob patterns
 * (case-insensitive, Python parity).
 */
export function fnmatchFilter(
  value: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) => getCachedRegex(pattern).test(value))
}

/**
 * Normalizes path separators to forward slashes.
 */
export function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, "/")
}
