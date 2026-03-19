import type {
  Assignment,
  Group,
  GroupSelectionMode,
  GroupSelectionPreview,
  GroupSet,
  PatternFilterResult,
  Roster,
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

export function filterByPattern(
  pattern: string,
  values: readonly string[],
): PatternFilterResult {
  const validation = validateGlobPattern(pattern)
  if (!validation.ok) {
    return {
      valid: false,
      error: validation.issues[0]?.message ?? "Invalid glob pattern.",
      matchedIndexes: [],
      matchedCount: 0,
    }
  }

  const matchedIndexes = values.flatMap((value, index) => {
    const match = globMatches(pattern, value)
    return match.ok && match.value ? [index] : []
  })

  return {
    valid: true,
    error: null,
    matchedIndexes,
    matchedCount: matchedIndexes.length,
  }
}

export function resolveGroupsFromSelection(
  roster: Roster,
  groupSet: GroupSet,
  selection: GroupSelectionMode,
): Group[] {
  const groups = groupSet.groupIds.flatMap((groupId) => {
    const group = roster.groups.find((candidate) => candidate.id === groupId)
    return group === undefined ? [] : [group]
  })

  const matched =
    selection.kind === "pattern"
      ? groups.filter((group) => {
          const result = globMatches(selection.pattern, group.name)
          return result.ok && result.value
        })
      : groups

  const excludedIds = new Set(selection.excludedGroupIds)
  return matched.filter((group) => !excludedIds.has(group.id))
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

  return resolveGroupsFromSelection(roster, groupSet, groupSet.groupSelection)
}

export function previewGroupSelection(
  roster: Roster,
  groupSetId: string,
  selection: GroupSelectionMode,
): GroupSelectionPreview {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  )
  if (groupSet === undefined) {
    return {
      valid: false,
      error: "Group set not found",
      groupIds: [],
      emptyGroupIds: [],
      groupMemberCounts: [],
      totalGroups: 0,
      matchedGroups: 0,
    }
  }

  const allGroups = groupSet.groupIds.flatMap((groupId) => {
    const group = roster.groups.find((candidate) => candidate.id === groupId)
    return group === undefined ? [] : [group]
  })

  if (selection.kind === "pattern") {
    const validation = validateGlobPattern(selection.pattern)
    if (!validation.ok) {
      return {
        valid: false,
        error: validation.issues[0]?.message ?? "Invalid glob pattern.",
        groupIds: [],
        emptyGroupIds: [],
        groupMemberCounts: [],
        totalGroups: allGroups.length,
        matchedGroups: 0,
      }
    }
  }

  const matchedBeforeExclusions =
    selection.kind === "pattern"
      ? allGroups.filter((group) => {
          const result = globMatches(selection.pattern, group.name)
          return result.ok && result.value
        })
      : allGroups

  const resolvedGroups = resolveGroupsFromSelection(roster, groupSet, selection)

  return {
    valid: true,
    error: null,
    groupIds: resolvedGroups.map((group) => group.id),
    emptyGroupIds: resolvedGroups
      .filter((group) => group.memberIds.length === 0)
      .map((group) => group.id),
    groupMemberCounts: resolvedGroups.map((group) => ({
      groupId: group.id,
      memberCount: group.memberIds.length,
    })),
    totalGroups: allGroups.length,
    matchedGroups: matchedBeforeExclusions.length,
  }
}
