import type { PersonDbSnapshot } from "@repo-edu/domain/analysis"
import { bridgeAuthorsToRoster } from "@repo-edu/domain/analysis"
import type { Roster } from "@repo-edu/domain/types"

export type ExaminationLocalIdentityContext = {
  names: string[]
  emails: string[]
  opaqueIdentifiers: string[]
  gitUsernames: string[]
}

function normalizeIdentityText(value: string): string {
  return value.trim().split(/\s+/).join(" ")
}

function dedupeByComparison(
  values: readonly string[],
  compare: (value: string) => string,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const value = normalizeIdentityText(raw)
    if (value.length === 0) continue
    const key = compare(value)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalizeIdentityValues(
  values: readonly string[],
  compare: (value: string) => string,
): string[] {
  return dedupeByComparison(values, compare).toSorted(compareStrings)
}

export function canonicalizeExaminationLocalIdentityContext(
  context: ExaminationLocalIdentityContext,
): ExaminationLocalIdentityContext {
  return {
    names: canonicalizeIdentityValues(context.names, (value) =>
      value.toLowerCase(),
    ),
    emails: canonicalizeIdentityValues(context.emails, (value) =>
      value.toLowerCase(),
    ),
    opaqueIdentifiers: canonicalizeIdentityValues(
      context.opaqueIdentifiers,
      (value) => value,
    ),
    gitUsernames: canonicalizeIdentityValues(context.gitUsernames, (value) =>
      value.toLowerCase(),
    ),
  }
}

function containsAsciiLetter(value: string): boolean {
  return /[A-Za-z]/.test(value)
}

export function buildExaminationLocalIdentityContext({
  personDb,
  roster,
}: {
  personDb: PersonDbSnapshot
  roster?: Roster | null
}): ExaminationLocalIdentityContext {
  const names: string[] = []
  const emails: string[] = []
  const opaqueIdentifiers: string[] = []
  const gitUsernames: string[] = []

  for (const person of personDb.persons) {
    names.push(person.canonicalName)
    emails.push(person.canonicalEmail)
    for (const alias of person.aliases) {
      names.push(alias.name)
      emails.push(alias.email)
    }
  }

  if (roster) {
    const members = [...roster.students, ...roster.staff]
    const memberById = new Map(members.map((member) => [member.id, member]))
    const bridge = bridgeAuthorsToRoster(personDb, members)
    for (const match of bridge.matches) {
      const member = memberById.get(match.memberId)
      if (!member) continue
      names.push(member.name)
      emails.push(member.email)
      const memberId = normalizeIdentityText(member.id)
      if (containsAsciiLetter(memberId)) {
        opaqueIdentifiers.push(memberId)
      }
      const lmsUserId =
        member.lmsUserId === null ? "" : normalizeIdentityText(member.lmsUserId)
      if (containsAsciiLetter(lmsUserId)) {
        opaqueIdentifiers.push(lmsUserId)
      }
      if (member.gitUsername !== null) {
        gitUsernames.push(member.gitUsername)
      }
    }
  }

  return {
    names: dedupeByComparison(names, (value) => value.toLowerCase()),
    emails: dedupeByComparison(emails, (value) => value.toLowerCase()),
    opaqueIdentifiers: dedupeByComparison(opaqueIdentifiers, (value) => value),
    gitUsernames: dedupeByComparison(gitUsernames, (value) =>
      value.toLowerCase(),
    ),
  }
}
