import outmatch from "outmatch"
import type { ValidationResult } from "./types.js"

export type PatternPredicate = (value: string) => boolean

const COMMON_OPTIONS = {
  separator: false,
  excludeDot: false,
  "!": false,
  "()": false,
  "{}": false,
} as const

function preserveLiteralBackslashes(pattern: string): string {
  return pattern.replaceAll("\\", "\\\\")
}

function issue(message: string): ValidationResult<never> {
  return {
    ok: false,
    issues: [{ path: "pattern", message }],
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid glob pattern."
}

export function compileRepoNamePattern(
  pattern: string | undefined,
): PatternPredicate {
  if (pattern === undefined || pattern === "") {
    return () => true
  }

  return outmatch(preserveLiteralBackslashes(pattern), {
    ...COMMON_OPTIONS,
    "[]": false,
  })
}

export function compileAnalysisFilterPatterns(
  patterns: readonly string[],
): ValidationResult<PatternPredicate> {
  if (patterns.length === 0) {
    return { ok: true, value: () => false }
  }

  const preparedPatterns = patterns.map(preserveLiteralBackslashes)
  const options = {
    ...COMMON_OPTIONS,
    flags: "is",
  } as const

  for (let index = 0; index < preparedPatterns.length; index += 1) {
    try {
      outmatch(preparedPatterns[index], options)
    } catch (error) {
      return {
        ok: false,
        issues: [
          {
            path: `patterns.${index}`,
            message: errorMessage(error),
          },
        ],
      }
    }
  }

  try {
    return {
      ok: true,
      value: outmatch(preparedPatterns, options),
    }
  } catch (error) {
    return issue(errorMessage(error))
  }
}

type ClassAtom = {
  char: string
  escaped: boolean
}

function validateGroupNameClass(
  chars: readonly string[],
  openingIndex: number,
): ValidationResult<number> {
  let index = openingIndex + 1
  if (chars[index] === "!" || chars[index] === "^") {
    index += 1
  }

  if (chars[index] === "]") {
    return issue("empty bracket expression '[]' is not allowed")
  }

  const atoms: ClassAtom[] = []
  while (index < chars.length) {
    const char = chars[index]
    if (char === "]") {
      if (atoms.length === 0) {
        return issue("empty bracket expression '[]' is not allowed")
      }

      for (let atomIndex = 1; atomIndex < atoms.length - 1; atomIndex += 1) {
        const rangeMarker = atoms[atomIndex]
        if (rangeMarker.char !== "-" || rangeMarker.escaped) continue

        const start = atoms[atomIndex - 1].char
        const end = atoms[atomIndex + 1].char
        const startCodePoint = start.codePointAt(0) ?? 0
        const endCodePoint = end.codePointAt(0) ?? 0
        if (startCodePoint > endCodePoint) {
          return issue(
            `descending character range '${start}-${end}' is not allowed`,
          )
        }
      }

      return { ok: true, value: index }
    }

    if (char === "\\") {
      const escaped = chars[index + 1]
      if (escaped === undefined) {
        return issue("pattern ends with unescaped backslash")
      }
      atoms.push({ char: escaped, escaped: true })
      index += 2
      continue
    }

    atoms.push({ char, escaped: false })
    index += 1
  }

  return issue("unclosed '[' bracket")
}

function validateGroupNamePattern(pattern: string): ValidationResult<string> {
  const chars = Array.from(pattern)

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    if (char === "\\") {
      if (chars[index + 1] === undefined) {
        return issue("pattern ends with unescaped backslash")
      }
      index += 1
      continue
    }

    if (char === "*" && chars[index + 1] === "*") {
      return issue("recursive glob '**' is not allowed")
    }

    if (char === "{" || char === "}") {
      return issue("brace expansion is not allowed")
    }

    if (
      (char === "@" ||
        char === "+" ||
        char === "!" ||
        char === "?" ||
        char === "*") &&
      chars[index + 1] === "("
    ) {
      return issue("extglob patterns are not allowed")
    }

    if (char === "[") {
      const validation = validateGroupNameClass(chars, index)
      if (!validation.ok) return validation
      index = validation.value
    }
  }

  return { ok: true, value: pattern }
}

export function compileGroupNamePattern(
  pattern: string,
): ValidationResult<PatternPredicate> {
  const validation = validateGroupNamePattern(pattern)
  if (!validation.ok) return validation

  try {
    return {
      ok: true,
      value: outmatch(pattern, {
        ...COMMON_OPTIONS,
        flags: "su",
      }),
    }
  } catch (error) {
    return issue(errorMessage(error))
  }
}
