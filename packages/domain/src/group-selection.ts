import type {
  Assignment,
  Group,
  GroupSet,
  Roster,
  UsernameTeam,
  ValidationResult,
} from "./types.js"

type SimpleGlobToken =
  | { kind: "star" }
  | { kind: "question" }
  | { kind: "literal"; char: string }
  | { kind: "class"; chars: string[]; negated: boolean }

function parseGlobCharClass(chars: string[], startIndex: number) {
  let index = startIndex + 1
  let negated = false
  const classChars: string[] = []

  if (index < chars.length && (chars[index] === "!" || chars[index] === "^")) {
    negated = true
    index += 1
  }

  if (index < chars.length && chars[index] === "]") {
    classChars.push("]")
    index += 1
  }

  while (index < chars.length) {
    const current = chars[index]
    if (current === "]") {
      if (classChars.length === 0) {
        throw new Error("empty bracket expression '[]' is not allowed")
      }

      return {
        token: {
          kind: "class" as const,
          chars: classChars,
          negated,
        },
        nextIndex: index + 1,
      }
    }

    if (
      index + 2 < chars.length &&
      chars[index + 1] === "-" &&
      chars[index + 2] !== "]"
    ) {
      const end = chars[index + 2]
      if (current <= end) {
        for (
          let charCode = current.charCodeAt(0);
          charCode <= end.charCodeAt(0);
          charCode += 1
        ) {
          classChars.push(String.fromCharCode(charCode))
        }
      } else {
        classChars.push(current, "-", end)
      }
      index += 3
      continue
    }

    classChars.push(current)
    index += 1
  }

  throw new Error("unclosed '[' bracket")
}

function parseSimpleGlob(pattern: string): SimpleGlobToken[] {
  const chars = Array.from(pattern)
  const tokens: SimpleGlobToken[] = []

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    switch (char) {
      case "\\": {
        const escaped = chars[index + 1]
        if (escaped === undefined) {
          throw new Error("pattern ends with unescaped backslash")
        }
        tokens.push({ kind: "literal", char: escaped })
        index += 1
        break
      }
      case "*":
        if (chars[index + 1] === "*") {
          throw new Error("recursive glob '**' is not allowed")
        }
        tokens.push({ kind: "star" })
        break
      case "?":
        tokens.push({ kind: "question" })
        break
      case "[":
        {
          const { token, nextIndex } = parseGlobCharClass(chars, index)
          tokens.push(token)
          index = nextIndex - 1
        }
        break
      case "{":
        throw new Error("brace expansion is not allowed")
      case "@":
      case "+":
      case "!":
        if (chars[index + 1] === "(") {
          throw new Error("extglob patterns are not allowed")
        }
        tokens.push({ kind: "literal", char })
        break
      default:
        tokens.push({ kind: "literal", char })
        break
    }
  }

  return tokens
}

function matchesSimpleGlobTokens(
  tokens: readonly SimpleGlobToken[],
  chars: readonly string[],
): boolean {
  if (tokens.length === 0) {
    return chars.length === 0
  }

  const [token, ...restTokens] = tokens
  switch (token.kind) {
    case "literal":
      return chars[0] === token.char
        ? matchesSimpleGlobTokens(restTokens, chars.slice(1))
        : false
    case "question":
      return chars.length > 0
        ? matchesSimpleGlobTokens(restTokens, chars.slice(1))
        : false
    case "class":
      if (chars.length === 0) {
        return false
      }
      {
        const matched = token.chars.includes(chars[0])
        const passes = token.negated ? !matched : matched
        return passes
          ? matchesSimpleGlobTokens(restTokens, chars.slice(1))
          : false
      }
    case "star":
      for (let index = 0; index <= chars.length; index += 1) {
        if (matchesSimpleGlobTokens(restTokens, chars.slice(index))) {
          return true
        }
      }
      return false
  }
}

export function validateGlobPattern(pattern: string): ValidationResult<string> {
  try {
    parseSimpleGlob(pattern)
    return { ok: true, value: pattern }
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          path: "pattern",
          message:
            error instanceof Error ? error.message : "Invalid glob pattern.",
        },
      ],
    }
  }
}

export function globMatches(
  pattern: string,
  value: string,
): ValidationResult<boolean> {
  try {
    const tokens = parseSimpleGlob(pattern)
    return {
      ok: true,
      value: matchesSimpleGlobTokens(tokens, Array.from(value)),
    }
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          path: "pattern",
          message:
            error instanceof Error ? error.message : "Invalid glob pattern.",
        },
      ],
    }
  }
}

function resolveNamedGroups(roster: Roster, groupIds: string[]): Group[] {
  return groupIds.flatMap((groupId) => {
    const group = roster.groups.find((candidate) => candidate.id === groupId)
    return group === undefined ? [] : [group]
  })
}

function resolveUnnamedTeams(teams: UsernameTeam[]): Group[] {
  return teams.map((team) => ({
    id: team.id,
    name: team.gitUsernames.join("-"),
    memberIds: [],
    origin: "local" as const,
    lmsGroupId: null,
  }))
}

export function resolveGroupSetGroups(
  roster: Roster,
  groupSet: GroupSet,
): Group[] {
  switch (groupSet.nameMode) {
    case "named":
      return resolveNamedGroups(roster, groupSet.groupIds)
    case "unnamed":
      return resolveUnnamedTeams(groupSet.teams)
  }
}

export function resolveAssignmentGroups(
  roster: Roster,
  assignment: Assignment,
): Group[] {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === assignment.groupSetId,
  )
  if (groupSet === undefined) {
    return []
  }

  return resolveGroupSetGroups(roster, groupSet)
}
