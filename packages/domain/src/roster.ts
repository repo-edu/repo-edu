import type {
  MemberStatus,
  Roster,
  RosterMember,
  RosterMemberNormalizationInput,
} from "./types.js"

import {
  enrollmentTypeKinds,
  gitUsernameStatusKinds,
  memberStatusKinds,
} from "./types.js"

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeEnumValue<const TAllowed extends readonly string[]>(
  value: unknown,
  allowed: TAllowed,
  fallback: TAllowed[number],
): TAllowed[number] {
  const normalized = normalizeOptionalString(value)
  if (normalized === null) {
    return fallback
  }

  return allowed.includes(normalized) ? normalized : fallback
}

export function normalizeMissingEmailStatus(
  email: string,
  status: MemberStatus,
): MemberStatus {
  return email === "" && status === "active" ? "incomplete" : status
}

function shortId(id: string): string {
  const hex = Array.from(id)
    .filter((char) => /[0-9a-f]/i.test(char))
    .slice(0, 4)
    .join("")
    .toLowerCase()

  if (hex.length > 0) {
    return hex
  }

  return normalizeSlug(id).slice(0, 4) || "id"
}

function normalizeSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

/** Like normalizeSlug but uses `.` as the separator within a name part. */
function normalizeNameSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".")
}

function sortableToDisplay(name: string): string {
  const commaIndex = name.indexOf(",")
  if (commaIndex < 0) {
    return name
  }

  const beforeComma = name.slice(0, commaIndex).trim()
  const afterComma = name.slice(commaIndex + 1).trim()
  return afterComma.length === 0 ? beforeComma : `${afterComma} ${beforeComma}`
}

// ---------------------------------------------------------------------------
// Exported helpers (needed by group-set.ts and validation)
// ---------------------------------------------------------------------------

export function generateEntityId(prefix: string): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${randomPart}`
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Roster normalization
// ---------------------------------------------------------------------------

export function normalizeRosterMember(
  input: RosterMemberNormalizationInput,
): RosterMember {
  const id =
    typeof input.id === "string"
      ? input.id.trim()
      : String(input.id ?? "").trim()
  const name =
    (input.nameCandidates ?? input.displayNameCandidates)
      ?.map(normalizeOptionalString)
      .find((value): value is string => value !== null) ?? id
  const email =
    input.emailCandidates
      ?.map(normalizeOptionalString)
      .find((value): value is string => value !== null) ?? ""
  const status = normalizeMissingEmailStatus(
    email,
    normalizeEnumValue(input.status, memberStatusKinds, "active"),
  )

  return {
    id,
    name,
    email,
    studentNumber: normalizeOptionalString(input.studentNumber),
    gitUsername: normalizeOptionalString(input.gitUsername),
    gitUsernameStatus: normalizeEnumValue(
      input.gitUsernameStatus,
      gitUsernameStatusKinds,
      "unknown",
    ),
    status,
    lmsStatus:
      input.lmsStatus === undefined || input.lmsStatus === null
        ? null
        : normalizeEnumValue(input.lmsStatus, memberStatusKinds, "active"),
    lmsUserId: normalizeOptionalString(input.lmsUserId),
    enrollmentType: normalizeEnumValue(
      input.enrollmentType,
      enrollmentTypeKinds,
      "student",
    ),
    enrollmentDisplay: normalizeOptionalString(input.enrollmentDisplay),
    department: normalizeOptionalString(input.department),
    institution: normalizeOptionalString(input.institution),
    source: normalizeOptionalString(input.source) ?? "local",
  }
}

export function normalizeRoster(
  students: readonly RosterMemberNormalizationInput[],
  staff: readonly RosterMemberNormalizationInput[] = [],
): Roster {
  return {
    connection: null,
    students: students.map((student) =>
      normalizeRosterMember({
        ...student,
        enrollmentType: normalizeEnumValue(
          student.enrollmentType,
          enrollmentTypeKinds,
          "student",
        ),
      }),
    ),
    staff: staff.map((member) =>
      normalizeRosterMember({
        ...member,
        enrollmentType: normalizeEnumValue(
          member.enrollmentType,
          enrollmentTypeKinds,
          "teacher",
        ),
      }),
    ),
    groups: [],
    groupSets: [],
    assignments: [],
  }
}

// ---------------------------------------------------------------------------
// Name parsing and group naming
// ---------------------------------------------------------------------------

export function parseName(name: string): { given: string; surname: string } {
  const displayName = sortableToDisplay(name.trim())
  const parts = displayName.split(/\s+/).filter((part) => part.length > 0)
  if (parts.length === 0) {
    return { given: "", surname: "" }
  }

  if (parts.length === 1) {
    return { given: parts[0], surname: "" }
  }

  const surnameParticles = new Set([
    "da",
    "de",
    "del",
    "della",
    "den",
    "der",
    "di",
    "du",
    "la",
    "le",
    "ter",
    "van",
    "von",
  ])

  let surnameStart = parts.length - 1
  while (surnameStart > 0) {
    const previous = parts[surnameStart - 1]
    if (!surnameParticles.has(previous.toLowerCase())) {
      break
    }
    surnameStart -= 1
  }

  return {
    given: parts.slice(0, surnameStart).join(" "),
    surname: parts.slice(surnameStart).join(" "),
  }
}

/** Sort key for a surname: strips leading particles so "de Oliveira" sorts under "O". */
export function surnameSortKey(surname: string): string {
  const particles = new Set([
    "da",
    "de",
    "del",
    "della",
    "den",
    "der",
    "di",
    "du",
    "la",
    "le",
    "ter",
    "van",
    "von",
  ])
  const parts = surname.split(/\s+/)
  let start = 0
  while (
    start < parts.length - 1 &&
    particles.has(parts[start].toLowerCase())
  ) {
    start += 1
  }
  return parts.slice(start).join(" ")
}

export function computeMembersSurnamesSlug(
  memberNames: readonly string[],
  limit = 5,
): string {
  const sorted = [...memberNames].sort((a, b) => {
    const sa = surnameSortKey(parseName(a).surname)
    const sb = surnameSortKey(parseName(b).surname)
    return sa.localeCompare(sb, undefined, { sensitivity: "base" })
  })
  return sorted
    .slice(0, limit)
    .map((name) => {
      const slug = normalizeNameSlug(parseName(name).surname)
      return slug.length > 0 ? slug : ""
    })
    .filter((s) => s.length > 0)
    .join("-")
}

export function generateGroupName(members: readonly RosterMember[]): string {
  if (members.length === 0) {
    return "empty-group"
  }

  if (members.length === 1) {
    const member = members[0]
    const parsed = parseName(member.name)
    const given = normalizeNameSlug(parsed.given)
    const surname = normalizeNameSlug(parsed.surname)
    if (given.length === 0 && surname.length === 0) {
      return `member-${shortId(member.id)}`
    }
    if (given.length === 0) {
      return surname
    }
    if (surname.length === 0) {
      return given
    }
    return `${given}.${surname}`
  }

  const memberLimit = 5
  const surnames = members.slice(0, memberLimit).map((member) => {
    const surname = normalizeNameSlug(parseName(member.name).surname)
    return surname.length > 0 ? surname : shortId(member.id)
  })

  if (members.length <= memberLimit) {
    return surnames.join("-")
  }

  return `${surnames.join("-")}-+${members.length - memberLimit}`
}

export function resolveGroupNameCollision(
  baseName: string,
  existingNames: ReadonlySet<string>,
  memberId?: string,
): string {
  if (memberId !== undefined) {
    const withIdSuffix = `${baseName}.${shortId(memberId)}`
    if (!existingNames.has(withIdSuffix)) {
      return withIdSuffix
    }
  }

  for (let counter = 2; counter <= 1000; counter += 1) {
    const candidate = `${baseName}-${counter}`
    if (!existingNames.has(candidate)) {
      return candidate
    }
  }

  return `${baseName}-${shortId(generateEntityId("collision"))}`
}

export function generateUniqueGroupName(
  members: readonly RosterMember[],
  existingNames: ReadonlySet<string>,
): string {
  const baseName = generateGroupName(members)
  if (!existingNames.has(baseName)) {
    return baseName
  }

  return resolveGroupNameCollision(
    baseName,
    existingNames,
    members.length === 1 ? members[0]?.id : undefined,
  )
}
