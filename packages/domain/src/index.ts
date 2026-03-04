import { z } from "zod";

export const packageId = "@repo-edu/domain";

export const persistedAppSettingsKind = "repo-edu.app-settings.v1" as const;
export const persistedProfileKind = "repo-edu.profile.v2" as const;

export const lmsProviderKinds = ["canvas", "moodle"] as const;
export const gitProviderKinds = ["github", "gitlab", "gitea"] as const;
export const gitUsernameStatusKinds = ["unknown", "valid", "invalid"] as const;
export const memberStatusKinds = ["active", "incomplete", "dropped"] as const;
export const enrollmentTypeKinds = [
  "student",
  "teacher",
  "ta",
  "designer",
  "observer",
  "other",
] as const;
export const groupOriginKinds = ["system", "lms", "local"] as const;

export type LmsProviderKind = (typeof lmsProviderKinds)[number];
export type GitProviderKind = (typeof gitProviderKinds)[number];
export type ProviderKind = LmsProviderKind | GitProviderKind | "git";
export type GitUsernameStatus = (typeof gitUsernameStatusKinds)[number];
export type MemberStatus = (typeof memberStatusKinds)[number];
export type EnrollmentType = (typeof enrollmentTypeKinds)[number];
export type GroupOrigin = (typeof groupOriginKinds)[number];
export type GitIdentityMode = "email" | "username";

export type FileFormat = "csv" | "xlsx" | "yaml" | "json";
export type ThemePreference = "system" | "light" | "dark";
export type WindowChromeMode = "system" | "hiddenInset";
export type ExportFormat = Extract<FileFormat, "csv" | "xlsx" | "yaml">;

export type PersistedLmsConnection = {
  name: string;
  provider: LmsProviderKind;
  baseUrl: string;
  token: string;
};

export type PersistedGitConnection = {
  name: string;
  provider: GitProviderKind;
  baseUrl: string | null;
  token: string;
  organization: string | null;
};

export type AppAppearance = {
  theme: ThemePreference;
  windowChrome: WindowChromeMode;
};

export type PersistedAppSettings = {
  kind: typeof persistedAppSettingsKind;
  schemaVersion: 1;
  activeProfileId: string | null;
  appearance: AppAppearance;
  lmsConnections: PersistedLmsConnection[];
  gitConnections: PersistedGitConnection[];
  lastOpenedAt: string | null;
};

export type RosterConnection =
  | {
      kind: "canvas";
      courseId: string;
      lastUpdated: string;
    }
  | {
      kind: "moodle";
      courseId: string;
      lastUpdated: string;
    }
  | {
      kind: "import";
      sourceFilename: string;
      lastUpdated: string;
    };

export type RosterMember = {
  id: string;
  name: string;
  email: string;
  studentNumber: string | null;
  gitUsername: string | null;
  gitUsernameStatus: GitUsernameStatus;
  status: MemberStatus;
  lmsStatus: MemberStatus | null;
  lmsUserId: string | null;
  enrollmentType: EnrollmentType;
  enrollmentDisplay: string | null;
  department: string | null;
  institution: string | null;
  source: string;
};

export type Roster = {
  connection: RosterConnection | null;
  students: RosterMember[];
  staff: RosterMember[];
  groups: Group[];
  groupSets: GroupSet[];
  assignments: Assignment[];
};

export type Group = {
  id: string;
  name: string;
  memberIds: string[];
  origin: GroupOrigin;
  lmsGroupId: string | null;
};

export type GroupSelectionMode =
  | {
      kind: "all";
      excludedGroupIds: string[];
    }
  | {
      kind: "pattern";
      pattern: string;
      excludedGroupIds: string[];
    };

export type GroupSetConnection =
  | {
      kind: "system";
      systemType: string;
    }
  | {
      kind: "canvas";
      courseId: string;
      groupSetId: string;
      lastUpdated: string;
    }
  | {
      kind: "moodle";
      courseId: string;
      groupingId: string;
      lastUpdated: string;
    }
  | {
      kind: "import";
      sourceFilename: string;
      sourcePath: string | null;
      lastUpdated: string;
    };

export type GroupSet = {
  id: string;
  name: string;
  groupIds: string[];
  connection: GroupSetConnection | null;
  groupSelection: GroupSelectionMode;
};

export type Assignment = {
  id: string;
  name: string;
  groupSetId: string;
};

export type RepositoryTemplate = {
  owner: string;
  name: string;
  visibility: "private" | "internal" | "public";
};

export type PersistedProfile = {
  kind: typeof persistedProfileKind;
  schemaVersion: 2;
  id: string;
  displayName: string;
  lmsConnectionName: string | null;
  gitConnectionName: string | null;
  courseId: string | null;
  roster: Roster;
  repositoryTemplate: RepositoryTemplate | null;
  updatedAt: string;
};

export type ProfileSummary = Pick<
  PersistedProfile,
  "id" | "displayName" | "updatedAt"
>;

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; issues: ValidationIssue[] };

export type PatternFilterResult = {
  valid: boolean;
  error: string | null;
  matchedIndexes: number[];
  matchedCount: number;
};

export type GroupSelectionPreview = {
  valid: boolean;
  error: string | null;
  groupIds: string[];
  emptyGroupIds: string[];
  groupMemberCounts: Array<{
    groupId: string;
    memberCount: number;
  }>;
  totalGroups: number;
  matchedGroups: number;
};

export type SystemGroupSetEnsureResult = {
  groupSets: GroupSet[];
  groupsUpserted: Group[];
  deletedGroupIds: string[];
};

export type GroupSetImportRow = {
  group_name: string;
  group_id?: string;
  name?: string;
  email?: string;
};

export type GroupSetImportSource = {
  sourceFilename: string;
  sourcePath?: string | null;
  lastUpdated?: string;
};

export type GroupSetImportPreviewGroup = {
  name: string;
  memberCount: number;
};

export type GroupSetImportMissingMember = {
  groupName: string;
  missingCount: number;
};

export type GroupSetRenamedGroup = {
  from: string;
  to: string;
};

export type GroupSetImportPreview =
  | {
      mode: "import";
      groups: GroupSetImportPreviewGroup[];
      missingMembers: GroupSetImportMissingMember[];
      totalMissing: number;
    }
  | {
      mode: "reimport";
      groups: GroupSetImportPreviewGroup[];
      missingMembers: GroupSetImportMissingMember[];
      totalMissing: number;
      addedGroupNames: string[];
      removedGroupNames: string[];
      updatedGroupNames: string[];
      renamedGroups: GroupSetRenamedGroup[];
    };

export type GroupSetImportResult = {
  mode: "import" | "reimport";
  groupSet: GroupSet;
  groupsUpserted: Group[];
  deletedGroupIds: string[];
  missingMembers: GroupSetImportMissingMember[];
  totalMissing: number;
};

export type GroupSetExportRow = {
  group_set_id: string;
  group_id: string;
  group_name: string;
  name: string;
  email: string;
};

export type RepoOperationMode = "create" | "clone" | "delete";

export type RepoCollisionKind = "already_exists" | "not_found";

export type RepoCollision = {
  groupId: string;
  groupName: string;
  repoName: string;
  kind: RepoCollisionKind;
};

export type RepoPreflightResult = {
  collisions: RepoCollision[];
  readyCount: number;
};

export type SkippedGroupReason =
  | "empty_group"
  | "all_members_skipped"
  | "repo_exists"
  | "repo_not_found";

export type SkippedGroup = {
  assignmentId: string;
  groupId: string;
  groupName: string;
  reason: SkippedGroupReason;
  context: string | null;
};

export type PlannedRepositoryGroup = {
  assignmentId: string;
  assignmentName: string;
  groupId: string;
  groupName: string;
  repoName: string;
  activeMemberIds: string[];
};

export type RepositoryOperationPlan = {
  assignment: Assignment;
  template: string;
  groups: PlannedRepositoryGroup[];
  skippedGroups: SkippedGroup[];
};

export const groupSetExportHeaders = [
  "group_set_id",
  "group_id",
  "group_name",
  "name",
  "email",
] as const;

export type RosterValidationKind =
  | "duplicate_student_id"
  | "missing_email"
  | "invalid_email"
  | "duplicate_email"
  | "duplicate_assignment_name"
  | "duplicate_group_id_in_assignment"
  | "duplicate_group_name_in_assignment"
  | "duplicate_repo_name_in_assignment"
  | "orphan_group_member"
  | "empty_group"
  | "system_group_sets_missing"
  | "invalid_enrollment_partition"
  | "invalid_group_origin"
  | "missing_git_username"
  | "invalid_git_username"
  | "unassigned_student"
  | "student_in_multiple_groups_in_assignment";

export type RosterValidationIssue = {
  kind: RosterValidationKind;
  affectedIds: string[];
  context: string | null;
};

export type RosterValidationResult = {
  issues: RosterValidationIssue[];
};

export type RosterMemberNormalizationInput = {
  id: unknown;
  studentNumber?: unknown;
  nameCandidates?: unknown[];
  displayNameCandidates?: unknown[];
  emailCandidates?: unknown[];
  gitUsername?: unknown;
  gitUsernameStatus?: unknown;
  status?: unknown;
  lmsStatus?: unknown;
  lmsUserId?: unknown;
  enrollmentType?: unknown;
  enrollmentDisplay?: unknown;
  department?: unknown;
  institution?: unknown;
  source?: unknown;
};

export const defaultAppSettings: PersistedAppSettings = {
  kind: persistedAppSettingsKind,
  schemaVersion: 1,
  activeProfileId: null,
  appearance: {
    theme: "system",
    windowChrome: "system",
  },
  lmsConnections: [],
  gitConnections: [],
  lastOpenedAt: null,
};

export const SYSTEM_TYPE_INDIVIDUAL_STUDENTS = "individual_students" as const;
export const SYSTEM_TYPE_STAFF = "staff" as const;
export const STAFF_GROUP_NAME = "staff" as const;
export const ORIGIN_SYSTEM: GroupOrigin = "system";
export const ORIGIN_LMS: GroupOrigin = "lms";
export const ORIGIN_LOCAL: GroupOrigin = "local";

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEnumValue<const TAllowed extends readonly string[]>(
  value: unknown,
  allowed: TAllowed,
  fallback: TAllowed[number],
): TAllowed[number] {
  const normalized = normalizeOptionalString(value);
  if (normalized === null) {
    return fallback;
  }

  return allowed.includes(normalized) ? normalized : fallback;
}

export function normalizeRosterMember(
  input: RosterMemberNormalizationInput,
): RosterMember {
  const id =
    typeof input.id === "string"
      ? input.id.trim()
      : String(input.id ?? "").trim();
  const name =
    (input.nameCandidates ?? input.displayNameCandidates)
      ?.map(normalizeOptionalString)
      .find((value): value is string => value !== null) ?? id;
  const email =
    input.emailCandidates
      ?.map(normalizeOptionalString)
      .find((value): value is string => value !== null) ?? "";

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
    status: normalizeEnumValue(input.status, memberStatusKinds, "active"),
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
  };
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
  };
}

function generateEntityId(prefix: string): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomPart}`;
}

function shortId(id: string): string {
  const hex = Array.from(id)
    .filter((char) => /[0-9a-f]/i.test(char))
    .slice(0, 4)
    .join("")
    .toLowerCase();

  if (hex.length > 0) {
    return hex;
  }

  return normalizeSlug(id).slice(0, 4) || "id";
}

function normalizeSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function sortableToDisplay(name: string): string {
  const commaIndex = name.indexOf(",");
  if (commaIndex < 0) {
    return name;
  }

  const beforeComma = name.slice(0, commaIndex).trim();
  const afterComma = name.slice(commaIndex + 1).trim();
  return afterComma.length === 0 ? beforeComma : `${afterComma} ${beforeComma}`;
}

function parseName(name: string): { given: string; surname: string } {
  const displayName = sortableToDisplay(name.trim());
  const parts = displayName.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return { given: "", surname: "" };
  }

  if (parts.length === 1) {
    return { given: parts[0], surname: "" };
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
  ]);

  let surnameStart = parts.length - 1;
  while (surnameStart > 0) {
    const previous = parts[surnameStart - 1];
    if (!surnameParticles.has(previous.toLowerCase())) {
      break;
    }
    surnameStart -= 1;
  }

  return {
    given: parts.slice(0, surnameStart).join(" "),
    surname: parts.slice(surnameStart).join(" "),
  };
}

export function generateGroupName(members: readonly RosterMember[]): string {
  if (members.length === 0) {
    return "empty-group";
  }

  if (members.length === 1) {
    const member = members[0];
    const parsed = parseName(member.name);
    const given = normalizeSlug(parsed.given);
    const surname = normalizeSlug(parsed.surname);
    if (given.length === 0 && surname.length === 0) {
      return `member-${shortId(member.id)}`;
    }
    if (given.length === 0) {
      return surname;
    }
    if (surname.length === 0) {
      return given;
    }
    return `${given}_${surname}`;
  }

  const memberLimit = 5;
  const surnames = members.slice(0, memberLimit).map((member) => {
    const surname = normalizeSlug(parseName(member.name).surname);
    return surname.length > 0 ? surname : shortId(member.id);
  });

  if (members.length <= memberLimit) {
    return surnames.join("-");
  }

  return `${surnames.join("-")}-+${members.length - memberLimit}`;
}

export function resolveGroupNameCollision(
  baseName: string,
  existingNames: ReadonlySet<string>,
  memberId?: string,
): string {
  if (memberId !== undefined) {
    const withIdSuffix = `${baseName}_${shortId(memberId)}`;
    if (!existingNames.has(withIdSuffix)) {
      return withIdSuffix;
    }
  }

  for (let counter = 2; counter <= 1000; counter += 1) {
    const candidate = `${baseName}-${counter}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }

  return `${baseName}-${shortId(generateEntityId("collision"))}`;
}

export function generateUniqueGroupName(
  members: readonly RosterMember[],
  existingNames: ReadonlySet<string>,
): string {
  const baseName = generateGroupName(members);
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  return resolveGroupNameCollision(
    baseName,
    existingNames,
    members.length === 1 ? members[0]?.id : undefined,
  );
}

type SimpleGlobToken =
  | { kind: "star" }
  | { kind: "question" }
  | { kind: "literal"; char: string }
  | { kind: "class"; chars: string[]; negated: boolean };

function parseGlobCharClass(chars: string[], startIndex: number) {
  let index = startIndex + 1;
  let negated = false;
  const classChars: string[] = [];

  if (index < chars.length && (chars[index] === "!" || chars[index] === "^")) {
    negated = true;
    index += 1;
  }

  if (index < chars.length && chars[index] === "]") {
    classChars.push("]");
    index += 1;
  }

  while (index < chars.length) {
    const current = chars[index];
    if (current === "]") {
      if (classChars.length === 0) {
        throw new Error("empty bracket expression '[]' is not allowed");
      }

      return {
        token: {
          kind: "class" as const,
          chars: classChars,
          negated,
        },
        nextIndex: index + 1,
      };
    }

    if (
      index + 2 < chars.length &&
      chars[index + 1] === "-" &&
      chars[index + 2] !== "]"
    ) {
      const end = chars[index + 2];
      if (current <= end) {
        for (
          let charCode = current.charCodeAt(0);
          charCode <= end.charCodeAt(0);
          charCode += 1
        ) {
          classChars.push(String.fromCharCode(charCode));
        }
      } else {
        classChars.push(current, "-", end);
      }
      index += 3;
      continue;
    }

    classChars.push(current);
    index += 1;
  }

  throw new Error("unclosed '[' bracket");
}

function parseSimpleGlob(pattern: string): SimpleGlobToken[] {
  const chars = Array.from(pattern);
  const tokens: SimpleGlobToken[] = [];

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    switch (char) {
      case "\\": {
        const escaped = chars[index + 1];
        if (escaped === undefined) {
          throw new Error("pattern ends with unescaped backslash");
        }
        tokens.push({ kind: "literal", char: escaped });
        index += 1;
        break;
      }
      case "*":
        if (chars[index + 1] === "*") {
          throw new Error("recursive glob '**' is not allowed");
        }
        tokens.push({ kind: "star" });
        break;
      case "?":
        tokens.push({ kind: "question" });
        break;
      case "[":
        {
          const { token, nextIndex } = parseGlobCharClass(chars, index);
          tokens.push(token);
          index = nextIndex - 1;
        }
        break;
      case "{":
        throw new Error("brace expansion is not allowed");
      case "@":
      case "+":
      case "!":
        if (chars[index + 1] === "(") {
          throw new Error("extglob patterns are not allowed");
        }
        tokens.push({ kind: "literal", char });
        break;
      default:
        tokens.push({ kind: "literal", char });
        break;
    }
  }

  return tokens;
}

function matchesSimpleGlobTokens(
  tokens: readonly SimpleGlobToken[],
  chars: readonly string[],
): boolean {
  if (tokens.length === 0) {
    return chars.length === 0;
  }

  const [token, ...restTokens] = tokens;
  switch (token.kind) {
    case "literal":
      return chars[0] === token.char
        ? matchesSimpleGlobTokens(restTokens, chars.slice(1))
        : false;
    case "question":
      return chars.length > 0
        ? matchesSimpleGlobTokens(restTokens, chars.slice(1))
        : false;
    case "class":
      if (chars.length === 0) {
        return false;
      }
      {
        const matched = token.chars.includes(chars[0]);
        const passes = token.negated ? !matched : matched;
        return passes
          ? matchesSimpleGlobTokens(restTokens, chars.slice(1))
          : false;
      }
    case "star":
      for (let index = 0; index <= chars.length; index += 1) {
        if (matchesSimpleGlobTokens(restTokens, chars.slice(index))) {
          return true;
        }
      }
      return false;
  }
}

export function validateGlobPattern(pattern: string): ValidationResult<string> {
  try {
    parseSimpleGlob(pattern);
    return { ok: true, value: pattern };
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
    };
  }
}

export function globMatches(
  pattern: string,
  value: string,
): ValidationResult<boolean> {
  try {
    const tokens = parseSimpleGlob(pattern);
    return {
      ok: true,
      value: matchesSimpleGlobTokens(tokens, Array.from(value)),
    };
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
    };
  }
}

export function filterByPattern(
  pattern: string,
  values: readonly string[],
): PatternFilterResult {
  const validation = validateGlobPattern(pattern);
  if (!validation.ok) {
    return {
      valid: false,
      error: validation.issues[0]?.message ?? "Invalid glob pattern.",
      matchedIndexes: [],
      matchedCount: 0,
    };
  }

  const matchedIndexes = values.flatMap((value, index) => {
    const match = globMatches(pattern, value);
    return match.ok && match.value ? [index] : [];
  });

  return {
    valid: true,
    error: null,
    matchedIndexes,
    matchedCount: matchedIndexes.length,
  };
}

export function selectionModeAll(): GroupSelectionMode {
  return {
    kind: "all",
    excludedGroupIds: [],
  };
}

export function selectionModePattern(pattern: string): GroupSelectionMode {
  return {
    kind: "pattern",
    pattern,
    excludedGroupIds: [],
  };
}

export function resolveGroupsFromSelection(
  roster: Roster,
  groupSet: GroupSet,
  selection: GroupSelectionMode,
): Group[] {
  const groups = groupSet.groupIds.flatMap((groupId) => {
    const group = roster.groups.find((candidate) => candidate.id === groupId);
    return group === undefined ? [] : [group];
  });

  const matched =
    selection.kind === "pattern"
      ? groups.filter((group) => {
          const result = globMatches(selection.pattern, group.name);
          return result.ok && result.value;
        })
      : groups;

  const excludedIds = new Set(selection.excludedGroupIds);
  return matched.filter((group) => !excludedIds.has(group.id));
}

export function resolveAssignmentGroups(
  roster: Roster,
  assignment: Assignment,
): Group[] {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === assignment.groupSetId,
  );
  if (groupSet === undefined) {
    return [];
  }

  return resolveGroupsFromSelection(roster, groupSet, groupSet.groupSelection);
}

export function previewGroupSelection(
  roster: Roster,
  groupSetId: string,
  selection: GroupSelectionMode,
): GroupSelectionPreview {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  );
  if (groupSet === undefined) {
    return {
      valid: false,
      error: "Group set not found",
      groupIds: [],
      emptyGroupIds: [],
      groupMemberCounts: [],
      totalGroups: 0,
      matchedGroups: 0,
    };
  }

  const allGroups = groupSet.groupIds.flatMap((groupId) => {
    const group = roster.groups.find((candidate) => candidate.id === groupId);
    return group === undefined ? [] : [group];
  });

  if (selection.kind === "pattern") {
    const validation = validateGlobPattern(selection.pattern);
    if (!validation.ok) {
      return {
        valid: false,
        error: validation.issues[0]?.message ?? "Invalid glob pattern.",
        groupIds: [],
        emptyGroupIds: [],
        groupMemberCounts: [],
        totalGroups: allGroups.length,
        matchedGroups: 0,
      };
    }
  }

  const matchedBeforeExclusions =
    selection.kind === "pattern"
      ? allGroups.filter((group) => {
          const result = globMatches(selection.pattern, group.name);
          return result.ok && result.value;
        })
      : allGroups;

  const resolvedGroups = resolveGroupsFromSelection(
    roster,
    groupSet,
    selection,
  );

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
  };
}

export function activeMemberIds(roster: Roster, group: Group): string[] {
  const activeIds = new Set(
    roster.students
      .concat(roster.staff)
      .filter((member) => member.status === "active")
      .map((member) => member.id),
  );

  return group.memberIds.filter((memberId) => activeIds.has(memberId));
}

function isSystemSet(groupSet: GroupSet, systemType: string): boolean {
  return (
    groupSet.connection?.kind === "system" &&
    groupSet.connection.systemType === systemType
  );
}

function createSystemConnection(systemType: string): GroupSetConnection {
  return {
    kind: "system",
    systemType,
  };
}

export function findSystemSet(
  roster: Roster,
  systemType: string,
): GroupSet | null {
  return (
    roster.groupSets.find((groupSet) => isSystemSet(groupSet, systemType)) ??
    null
  );
}

export function systemSetsMissing(roster: Roster): boolean {
  return (
    findSystemSet(roster, SYSTEM_TYPE_INDIVIDUAL_STUDENTS) === null ||
    findSystemSet(roster, SYSTEM_TYPE_STAFF) === null
  );
}

function ensureIndividualStudentsSet(roster: Roster): {
  groupSet: GroupSet;
  groupsUpserted: Group[];
  deletedGroupIds: string[];
} {
  const groupsUpserted: Group[] = [];
  const deletedGroupIds: string[] = [];

  let setIndex = roster.groupSets.findIndex((groupSet) =>
    isSystemSet(groupSet, SYSTEM_TYPE_INDIVIDUAL_STUDENTS),
  );
  if (setIndex < 0) {
    roster.groupSets.push({
      id: generateEntityId("group_set"),
      name: "Individual Students",
      groupIds: [],
      connection: createSystemConnection(SYSTEM_TYPE_INDIVIDUAL_STUDENTS),
      groupSelection: selectionModeAll(),
    });
    setIndex = roster.groupSets.length - 1;
  }

  const activeStudents = roster.students.filter(
    (student) => student.status === "active",
  );
  const setGroupIds = new Set(roster.groupSets[setIndex].groupIds);

  const existingByMember = new Map<string, number>();
  roster.groups.forEach((group, index) => {
    if (
      group.origin === ORIGIN_SYSTEM &&
      group.memberIds.length === 1 &&
      setGroupIds.has(group.id)
    ) {
      const memberId = group.memberIds[0];
      if (memberId !== undefined) {
        existingByMember.set(memberId, index);
      }
    }
  });

  const existingNames = new Set(
    roster.groups
      .filter((group) => setGroupIds.has(group.id))
      .map((group) => group.name),
  );
  const neededGroupIds: string[] = [];
  const neededGroupIdSet = new Set<string>();

  for (const student of activeStudents) {
    const existingIndex = existingByMember.get(student.id);
    if (existingIndex !== undefined) {
      const group = roster.groups[existingIndex];
      existingNames.delete(group.name);
      const expectedName = generateUniqueGroupName([student], existingNames);
      if (group.name !== expectedName) {
        group.name = expectedName;
        groupsUpserted.push({ ...group });
      }
      existingNames.add(expectedName);
      neededGroupIds.push(group.id);
      neededGroupIdSet.add(group.id);
      continue;
    }

    const newGroup: Group = {
      id: generateEntityId("group"),
      name: generateUniqueGroupName([student], existingNames),
      memberIds: [student.id],
      origin: ORIGIN_SYSTEM,
      lmsGroupId: null,
    };
    existingNames.add(newGroup.name);
    roster.groups.push(newGroup);
    groupsUpserted.push({ ...newGroup });
    neededGroupIds.push(newGroup.id);
    neededGroupIdSet.add(newGroup.id);
  }

  const previousGroupIds = [...roster.groupSets[setIndex].groupIds];
  for (const groupId of previousGroupIds) {
    if (neededGroupIdSet.has(groupId)) {
      continue;
    }

    const removedIndex = roster.groups.findIndex(
      (group) => group.id === groupId,
    );
    if (removedIndex < 0) {
      continue;
    }

    const [removedGroup] = roster.groups.splice(removedIndex, 1);
    deletedGroupIds.push(removedGroup.id);
    for (const groupSet of roster.groupSets) {
      groupSet.groupIds = groupSet.groupIds.filter(
        (candidate) => candidate !== removedGroup.id,
      );
    }
  }

  roster.groupSets[setIndex].groupIds = neededGroupIds;

  return {
    groupSet: { ...roster.groupSets[setIndex] },
    groupsUpserted,
    deletedGroupIds,
  };
}

function ensureStaffSet(roster: Roster): {
  groupSet: GroupSet;
  groupsUpserted: Group[];
  deletedGroupIds: string[];
} {
  const groupsUpserted: Group[] = [];

  let setIndex = roster.groupSets.findIndex((groupSet) =>
    isSystemSet(groupSet, SYSTEM_TYPE_STAFF),
  );
  if (setIndex < 0) {
    roster.groupSets.push({
      id: generateEntityId("group_set"),
      name: "Staff",
      groupIds: [],
      connection: createSystemConnection(SYSTEM_TYPE_STAFF),
      groupSelection: selectionModeAll(),
    });
    setIndex = roster.groupSets.length - 1;
  }

  const activeStaffIds = roster.staff
    .filter((member) => member.status === "active")
    .map((member) => member.id);

  const setGroupIds = new Set(roster.groupSets[setIndex].groupIds);
  const existingGroup = roster.groups.find(
    (group) =>
      group.origin === ORIGIN_SYSTEM &&
      group.name.toLowerCase() === STAFF_GROUP_NAME &&
      setGroupIds.has(group.id),
  );

  if (existingGroup !== undefined) {
    const nameChanged = existingGroup.name !== STAFF_GROUP_NAME;
    if (nameChanged) {
      existingGroup.name = STAFF_GROUP_NAME;
    }
    const membershipChanged =
      existingGroup.memberIds.length !== activeStaffIds.length ||
      existingGroup.memberIds.some(
        (memberId, index) => memberId !== activeStaffIds[index],
      );
    if (nameChanged || membershipChanged) {
      existingGroup.memberIds = [...activeStaffIds];
      groupsUpserted.push({ ...existingGroup });
    }
  } else {
    const newGroup: Group = {
      id: generateEntityId("group"),
      name: STAFF_GROUP_NAME,
      memberIds: [...activeStaffIds],
      origin: ORIGIN_SYSTEM,
      lmsGroupId: null,
    };
    roster.groups.push(newGroup);
    roster.groupSets[setIndex].groupIds = [
      ...roster.groupSets[setIndex].groupIds,
      newGroup.id,
    ];
    groupsUpserted.push({ ...newGroup });
  }

  return {
    groupSet: { ...roster.groupSets[setIndex] },
    groupsUpserted,
    deletedGroupIds: [],
  };
}

export function ensureSystemGroupSets(
  roster: Roster,
): SystemGroupSetEnsureResult {
  const individualStudents = ensureIndividualStudentsSet(roster);
  const staff = ensureStaffSet(roster);

  return {
    groupSets: [individualStudents.groupSet, staff.groupSet],
    groupsUpserted: [
      ...individualStudents.groupsUpserted,
      ...staff.groupsUpserted,
    ],
    deletedGroupIds: [
      ...individualStudents.deletedGroupIds,
      ...staff.deletedGroupIds,
    ],
  };
}

type ParsedGroupSetImportRow = {
  groupId: string | null;
  groupName: string;
  email: string | null;
};

type ParsedGroupSetImportGroup = {
  groupId: string | null;
  name: string;
  memberEmails: string[];
};

function importValidationError<T>(
  path: string,
  message: string,
): ValidationResult<T> {
  return {
    ok: false,
    issues: [{ path, message }],
  };
}

function parseGroupSetImportRows(
  rows: readonly GroupSetImportRow[],
): ValidationResult<ParsedGroupSetImportGroup[]> {
  if (rows.length === 0) {
    return importValidationError("$", "CSV file has no data rows");
  }

  const parsedRows: ParsedGroupSetImportRow[] = [];
  for (const [index, row] of rows.entries()) {
    const groupName = row.group_name.trim();
    if (groupName.length === 0) {
      return importValidationError(
        `rows.${index}.group_name`,
        `Line ${index + 2}: empty group_name`,
      );
    }

    parsedRows.push({
      groupName,
      groupId: normalizeOptionalString(row.group_id),
      email: normalizeOptionalString(row.email)?.toLowerCase() ?? null,
    });
  }

  const idToName = new Map<string, string>();
  for (const row of parsedRows) {
    if (row.groupId === null) {
      continue;
    }

    const existingName = idToName.get(row.groupId);
    if (existingName !== undefined && existingName !== row.groupName) {
      return importValidationError(
        "rows",
        `group_id '${row.groupId}' maps to multiple group names: '${existingName}' and '${row.groupName}'`,
      );
    }
    idToName.set(row.groupId, row.groupName);
  }

  const groupOrder: string[] = [];
  const groupsByName = new Map<string, ParsedGroupSetImportGroup>();
  const seenMemberships = new Set<string>();

  for (const row of parsedRows) {
    let group = groupsByName.get(row.groupName);
    if (group === undefined) {
      group = {
        groupId: row.groupId,
        name: row.groupName,
        memberEmails: [],
      };
      groupsByName.set(row.groupName, group);
      groupOrder.push(row.groupName);
    } else if (group.groupId === null && row.groupId !== null) {
      group.groupId = row.groupId;
    }

    if (row.email === null) {
      continue;
    }

    const membershipKey = `${row.groupName}\u0000${row.email}`;
    if (seenMemberships.has(membershipKey)) {
      return importValidationError(
        "rows",
        `Duplicate membership: group '${row.groupName}', email '${row.email}'`,
      );
    }
    seenMemberships.add(membershipKey);
    group.memberEmails.push(row.email);
  }

  const groups: ParsedGroupSetImportGroup[] = [];
  for (const groupName of groupOrder) {
    const group = groupsByName.get(groupName);
    if (group !== undefined) {
      groups.push(group);
    }
  }

  return {
    ok: true,
    value: groups,
  };
}

function buildRosterEmailIndex(roster: Roster): Map<string, string | null> {
  const index = new Map<string, string | null>();
  for (const member of roster.students.concat(roster.staff)) {
    const key = normalizeEmail(member.email);
    if (key.length === 0) {
      continue;
    }
    if (index.has(key)) {
      index.set(key, null);
      continue;
    }
    index.set(key, member.id);
  }
  return index;
}

function resolveGroupMemberIds(
  emails: readonly string[],
  emailIndex: ReadonlyMap<string, string | null>,
): string[] {
  const seen = new Set<string>();
  const memberIds: string[] = [];

  for (const email of emails) {
    const memberId = emailIndex.get(email);
    if (memberId === null || memberId === undefined || seen.has(memberId)) {
      continue;
    }
    seen.add(memberId);
    memberIds.push(memberId);
  }

  return memberIds;
}

function summarizeMissingMembers(
  groups: readonly ParsedGroupSetImportGroup[],
  emailIndex: ReadonlyMap<string, string | null>,
): { missingMembers: GroupSetImportMissingMember[]; totalMissing: number } {
  const missingMembers: GroupSetImportMissingMember[] = [];
  let totalMissing = 0;

  for (const group of groups) {
    let groupMissing = 0;
    for (const email of group.memberEmails) {
      const matchedId = emailIndex.get(email);
      if (matchedId === null || matchedId === undefined) {
        groupMissing += 1;
        totalMissing += 1;
      }
    }

    if (groupMissing > 0) {
      missingMembers.push({
        groupName: group.name,
        missingCount: groupMissing,
      });
    }
  }

  return { missingMembers, totalMissing };
}

function cloneGroupSelectionMode(
  selection: GroupSelectionMode,
): GroupSelectionMode {
  if (selection.kind === "all") {
    return {
      kind: "all",
      excludedGroupIds: [...selection.excludedGroupIds],
    };
  }
  return {
    kind: "pattern",
    pattern: selection.pattern,
    excludedGroupIds: [...selection.excludedGroupIds],
  };
}

function createImportConnection(
  source: GroupSetImportSource,
): GroupSetConnection {
  return {
    kind: "import",
    sourceFilename: source.sourceFilename,
    sourcePath: source.sourcePath ?? null,
    lastUpdated: source.lastUpdated ?? new Date().toISOString(),
  };
}

function compareMembershipSets(
  currentMemberIds: readonly string[],
  nextMemberIds: readonly string[],
): boolean {
  if (currentMemberIds.length !== nextMemberIds.length) {
    return false;
  }

  const currentSet = new Set(currentMemberIds);
  const nextSet = new Set(nextMemberIds);
  if (currentSet.size !== nextSet.size) {
    return false;
  }

  for (const memberId of currentSet) {
    if (!nextSet.has(memberId)) {
      return false;
    }
  }

  return true;
}

export function previewImportGroupSet(
  roster: Roster,
  rows: readonly GroupSetImportRow[],
): ValidationResult<GroupSetImportPreview> {
  const parsed = parseGroupSetImportRows(rows);
  if (!parsed.ok) {
    return parsed;
  }

  const emailIndex = buildRosterEmailIndex(roster);
  const { missingMembers, totalMissing } = summarizeMissingMembers(
    parsed.value,
    emailIndex,
  );

  return {
    ok: true,
    value: {
      mode: "import",
      groups: parsed.value.map((group) => ({
        name: group.name,
        memberCount: resolveGroupMemberIds(group.memberEmails, emailIndex)
          .length,
      })),
      missingMembers,
      totalMissing,
    },
  };
}

export function importGroupSet(
  roster: Roster,
  source: GroupSetImportSource,
  rows: readonly GroupSetImportRow[],
): ValidationResult<GroupSetImportResult> {
  const parsed = parseGroupSetImportRows(rows);
  if (!parsed.ok) {
    return parsed;
  }

  const emailIndex = buildRosterEmailIndex(roster);
  const { missingMembers, totalMissing } = summarizeMissingMembers(
    parsed.value,
    emailIndex,
  );

  const groupsUpserted: Group[] = parsed.value.map((parsedGroup) => ({
    id: generateEntityId("group"),
    name: parsedGroup.name,
    memberIds: resolveGroupMemberIds(parsedGroup.memberEmails, emailIndex),
    origin: ORIGIN_LOCAL,
    lmsGroupId: null,
  }));

  return {
    ok: true,
    value: {
      mode: "import",
      groupSet: {
        id: generateEntityId("group_set"),
        name: source.sourceFilename,
        groupIds: groupsUpserted.map((group) => group.id),
        connection: createImportConnection(source),
        groupSelection: selectionModeAll(),
      },
      groupsUpserted,
      deletedGroupIds: [],
      missingMembers,
      totalMissing,
    },
  };
}

export function previewReimportGroupSet(
  roster: Roster,
  groupSetId: string,
  rows: readonly GroupSetImportRow[],
): ValidationResult<GroupSetImportPreview> {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  );
  if (groupSet === undefined) {
    return importValidationError("groupSetId", "Group set not found");
  }

  const parsed = parseGroupSetImportRows(rows);
  if (!parsed.ok) {
    return parsed;
  }

  const emailIndex = buildRosterEmailIndex(roster);
  const { missingMembers, totalMissing } = summarizeMissingMembers(
    parsed.value,
    emailIndex,
  );

  const existingGroups = groupSet.groupIds
    .map((groupId) =>
      roster.groups.find((candidate) => candidate.id === groupId),
    )
    .filter((group): group is Group => group !== undefined);
  const existingByName = new Map<string, Group>();
  const existingById = new Map<string, Group>();
  for (const group of existingGroups) {
    if (!existingByName.has(group.name)) {
      existingByName.set(group.name, group);
    }
    existingById.set(group.id, group);
  }

  const matchedExistingIds = new Set<string>();
  const addedGroupNames: string[] = [];
  const updatedGroupNames: string[] = [];
  const renamedGroups: GroupSetRenamedGroup[] = [];

  for (const parsedGroup of parsed.value) {
    const matched =
      (parsedGroup.groupId === null
        ? undefined
        : existingById.get(parsedGroup.groupId)) ??
      existingByName.get(parsedGroup.name);

    if (matched === undefined) {
      addedGroupNames.push(parsedGroup.name);
      continue;
    }

    matchedExistingIds.add(matched.id);
    if (matched.name !== parsedGroup.name) {
      renamedGroups.push({
        from: matched.name,
        to: parsedGroup.name,
      });
    }

    const nextMemberIds = resolveGroupMemberIds(
      parsedGroup.memberEmails,
      emailIndex,
    );
    if (!compareMembershipSets(matched.memberIds, nextMemberIds)) {
      updatedGroupNames.push(parsedGroup.name);
    }
  }

  const removedGroupNames = existingGroups
    .filter((group) => !matchedExistingIds.has(group.id))
    .map((group) => group.name);

  return {
    ok: true,
    value: {
      mode: "reimport",
      groups: parsed.value.map((group) => ({
        name: group.name,
        memberCount: resolveGroupMemberIds(group.memberEmails, emailIndex)
          .length,
      })),
      missingMembers,
      totalMissing,
      addedGroupNames,
      removedGroupNames,
      updatedGroupNames,
      renamedGroups,
    },
  };
}

export function reimportGroupSet(
  roster: Roster,
  groupSetId: string,
  source: GroupSetImportSource,
  rows: readonly GroupSetImportRow[],
): ValidationResult<GroupSetImportResult> {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  );
  if (groupSet === undefined) {
    return importValidationError("groupSetId", "Group set not found");
  }

  const parsed = parseGroupSetImportRows(rows);
  if (!parsed.ok) {
    return parsed;
  }

  const emailIndex = buildRosterEmailIndex(roster);
  const { missingMembers, totalMissing } = summarizeMissingMembers(
    parsed.value,
    emailIndex,
  );

  const existingGroups = groupSet.groupIds
    .map((groupId) =>
      roster.groups.find((candidate) => candidate.id === groupId),
    )
    .filter((group): group is Group => group !== undefined);
  const existingByName = new Map<string, Group>();
  const existingById = new Map<string, Group>();
  for (const group of existingGroups) {
    if (!existingByName.has(group.name)) {
      existingByName.set(group.name, group);
    }
    existingById.set(group.id, group);
  }

  const matchedExistingIds = new Set<string>();
  const nextGroupIds: string[] = [];
  const groupsUpserted: Group[] = [];

  for (const parsedGroup of parsed.value) {
    const nextMemberIds = resolveGroupMemberIds(
      parsedGroup.memberEmails,
      emailIndex,
    );
    const matched =
      (parsedGroup.groupId === null
        ? undefined
        : existingById.get(parsedGroup.groupId)) ??
      existingByName.get(parsedGroup.name);

    if (matched !== undefined) {
      matchedExistingIds.add(matched.id);
      const updatedGroup: Group = {
        ...matched,
        name: parsedGroup.name,
        memberIds: nextMemberIds,
      };
      nextGroupIds.push(updatedGroup.id);
      groupsUpserted.push(updatedGroup);
      continue;
    }

    const createdGroup: Group = {
      id: generateEntityId("group"),
      name: parsedGroup.name,
      memberIds: nextMemberIds,
      origin: ORIGIN_LOCAL,
      lmsGroupId: null,
    };
    nextGroupIds.push(createdGroup.id);
    groupsUpserted.push(createdGroup);
  }

  return {
    ok: true,
    value: {
      mode: "reimport",
      groupSet: {
        ...groupSet,
        groupIds: nextGroupIds,
        connection: createImportConnection(source),
        groupSelection: cloneGroupSelectionMode(groupSet.groupSelection),
      },
      groupsUpserted,
      deletedGroupIds: existingGroups
        .filter((group) => !matchedExistingIds.has(group.id))
        .map((group) => group.id),
      missingMembers,
      totalMissing,
    },
  };
}

export function exportGroupSetRows(
  roster: Roster,
  groupSetId: string,
): ValidationResult<GroupSetExportRow[]> {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === groupSetId,
  );
  if (groupSet === undefined) {
    return importValidationError("groupSetId", "Group set not found");
  }

  const memberById = new Map<string, RosterMember>();
  for (const member of roster.students.concat(roster.staff)) {
    memberById.set(member.id, member);
  }

  const rows: GroupSetExportRow[] = [];
  for (const groupId of groupSet.groupIds) {
    const group = roster.groups.find((candidate) => candidate.id === groupId);
    if (group === undefined) {
      continue;
    }

    if (group.memberIds.length === 0) {
      rows.push({
        group_set_id: groupSet.id,
        group_id: group.id,
        group_name: group.name,
        name: "",
        email: "",
      });
      continue;
    }

    for (const memberId of group.memberIds) {
      const member = memberById.get(memberId);
      rows.push({
        group_set_id: groupSet.id,
        group_id: group.id,
        group_name: group.name,
        name: member?.name ?? "",
        email: member?.email ?? "",
      });
    }
  }

  return {
    ok: true,
    value: rows,
  };
}

const maxSlugLength = 100;
const defaultRepoTemplate = "{assignment}-{group}";

export function slugify(value: string): string {
  const slug = normalizeSlug(value.replace(/[_\s]+/g, "-"));
  return slug.slice(0, maxSlugLength).replace(/-+$/g, "");
}

export function expandTemplate(
  template: string,
  assignment: Assignment,
  group: Group,
): string {
  return template
    .replaceAll("{assignment}", assignment.name)
    .replaceAll("{group}", group.name)
    .replaceAll("{group_id}", group.id)
    .replaceAll("{initials}", "")
    .replaceAll("{surnames}", "");
}

export function computeRepoName(
  template: string,
  assignment: Assignment,
  group: Group,
): string {
  return slugify(expandTemplate(template, assignment, group));
}

function findAssignment(
  roster: Roster,
  assignmentId: string,
): Assignment | undefined {
  return roster.assignments.find((candidate) => candidate.id === assignmentId);
}

function isReadonlyMap(
  value: ReadonlyMap<string, boolean> | Record<string, boolean>,
): value is ReadonlyMap<string, boolean> {
  return typeof (value as ReadonlyMap<string, boolean>).get === "function";
}

function repoExistsLookup(
  repoExistsByName: ReadonlyMap<string, boolean> | Record<string, boolean>,
  repoName: string,
): boolean | undefined {
  if (isReadonlyMap(repoExistsByName)) {
    return repoExistsByName.get(repoName);
  }
  return repoExistsByName[repoName];
}

function repoCollisionKindForMode(mode: RepoOperationMode): RepoCollisionKind {
  return mode === "create" ? "already_exists" : "not_found";
}

export function planRepositoryOperation(
  roster: Roster,
  assignmentId: string,
  template = defaultRepoTemplate,
): ValidationResult<RepositoryOperationPlan> {
  const assignment = findAssignment(roster, assignmentId);
  if (assignment === undefined) {
    return importValidationError("assignmentId", "Assignment not found");
  }

  const skippedGroups: SkippedGroup[] = [];
  const groups: PlannedRepositoryGroup[] = [];
  const resolvedGroups = resolveAssignmentGroups(roster, assignment);

  for (const group of resolvedGroups) {
    const activeIds = activeMemberIds(roster, group);
    if (activeIds.length === 0) {
      skippedGroups.push({
        assignmentId: assignment.id,
        groupId: group.id,
        groupName: group.name,
        reason: "empty_group",
        context: null,
      });
      continue;
    }

    groups.push({
      assignmentId: assignment.id,
      assignmentName: assignment.name,
      groupId: group.id,
      groupName: group.name,
      repoName: computeRepoName(template, assignment, group),
      activeMemberIds: activeIds,
    });
  }

  return {
    ok: true,
    value: {
      assignment,
      template,
      groups,
      skippedGroups,
    },
  };
}

export function preflightRepositoryOperation(
  mode: RepoOperationMode,
  plan: RepositoryOperationPlan,
  repoExistsByName: ReadonlyMap<string, boolean> | Record<string, boolean>,
): ValidationResult<RepoPreflightResult> {
  const collisions: RepoCollision[] = [];
  const expectedCollisionKind = repoCollisionKindForMode(mode);

  for (const group of plan.groups) {
    const exists = repoExistsLookup(repoExistsByName, group.repoName);
    if (exists === undefined) {
      return importValidationError(
        "repoExistsByName",
        `Missing repository existence lookup for '${group.repoName}'`,
      );
    }

    const collides =
      (mode === "create" && exists) || (mode !== "create" && !exists);
    if (!collides) {
      continue;
    }

    collisions.push({
      groupId: group.groupId,
      groupName: group.groupName,
      repoName: group.repoName,
      kind: expectedCollisionKind,
    });
  }

  return {
    ok: true,
    value: {
      collisions,
      readyCount: Math.max(plan.groups.length - collisions.length, 0),
    },
  };
}

export function skippedGroupsFromRepoCollisions(
  assignmentId: string,
  collisions: readonly RepoCollision[],
): SkippedGroup[] {
  return collisions.map((collision) => ({
    assignmentId,
    groupId: collision.groupId,
    groupName: collision.groupName,
    reason:
      collision.kind === "already_exists" ? "repo_exists" : "repo_not_found",
    context: collision.repoName,
  }));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(value: string): string {
  return value.trim().split(/\s+/).join(" ").toLowerCase();
}

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort();
}

function findDuplicateStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }

  return sortedStrings([...duplicates]);
}

function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  const parts = trimmed.split("@");
  if (parts.length !== 2) {
    return false;
  }

  const [local, domain] = parts;
  if (local.length === 0 || domain.length === 0 || local.includes(" ")) {
    return false;
  }

  const lastDot = domain.lastIndexOf(".");
  return lastDot > 0 && lastDot < domain.length - 1;
}

function validateGroupSetOriginConsistency(
  roster: Roster,
  groupSet: GroupSet,
  issues: RosterValidationIssue[],
) {
  for (const groupId of groupSet.groupIds) {
    const group = roster.groups.find((candidate) => candidate.id === groupId);
    if (group === undefined) {
      continue;
    }

    const originMatches = (() => {
      switch (groupSet.connection?.kind) {
        case "system":
          return group.origin === ORIGIN_SYSTEM;
        case "canvas":
        case "moodle":
          return group.origin === ORIGIN_LMS;
        case "import":
          return group.origin === ORIGIN_LOCAL && group.lmsGroupId === null;
        case undefined:
          return true;
      }
    })();

    if (originMatches) {
      continue;
    }

    issues.push({
      kind: "invalid_group_origin",
      affectedIds: [group.id],
      context: `Group '${group.name}' has origin '${group.origin}' but group set '${groupSet.name}' expects different origin`,
    });
  }
}

export function validateRoster(roster: Roster): RosterValidationResult {
  const issues: RosterValidationIssue[] = [];

  if (systemSetsMissing(roster)) {
    issues.push({
      kind: "system_group_sets_missing",
      affectedIds: [],
      context: "Call ensureSystemGroupSets before validation",
    });
  }

  const allMemberIds = roster.students
    .concat(roster.staff)
    .map((member) => member.id);
  const duplicateMemberIds = findDuplicateStrings(allMemberIds);
  if (duplicateMemberIds.length > 0) {
    issues.push({
      kind: "duplicate_student_id",
      affectedIds: duplicateMemberIds,
      context: null,
    });
  }

  const missingEmails = roster.students
    .filter((member) => member.email.trim().length === 0)
    .map((member) => member.id);
  if (missingEmails.length > 0) {
    issues.push({
      kind: "missing_email",
      affectedIds: missingEmails,
      context: null,
    });
  }

  const invalidEmails = roster.students
    .filter((member) => member.email.trim().length > 0)
    .filter((member) => !isValidEmail(member.email))
    .map((member) => member.id);
  if (invalidEmails.length > 0) {
    issues.push({
      kind: "invalid_email",
      affectedIds: invalidEmails,
      context: null,
    });
  }

  const duplicateEmails = findDuplicateStrings(
    roster.students
      .filter((member) => member.email.trim().length > 0)
      .map((member) => normalizeEmail(member.email)),
  );
  if (duplicateEmails.length > 0) {
    issues.push({
      kind: "duplicate_email",
      affectedIds: duplicateEmails,
      context: null,
    });
  }

  const duplicateAssignmentNames = findDuplicateStrings(
    roster.assignments.map((assignment) => normalizeName(assignment.name)),
  );
  if (duplicateAssignmentNames.length > 0) {
    issues.push({
      kind: "duplicate_assignment_name",
      affectedIds: duplicateAssignmentNames,
      context: null,
    });
  }

  const duplicateGroupIds = findDuplicateStrings(
    roster.groups.map((group) => group.id),
  );
  if (duplicateGroupIds.length > 0) {
    issues.push({
      kind: "duplicate_group_id_in_assignment",
      affectedIds: duplicateGroupIds,
      context: "Duplicate group IDs in roster",
    });
  }

  const existingGroupIds = new Set(roster.groups.map((group) => group.id));
  for (const groupSet of roster.groupSets) {
    const orphanGroupRefs = groupSet.groupIds.filter(
      (groupId) => !existingGroupIds.has(groupId),
    );
    if (orphanGroupRefs.length > 0) {
      issues.push({
        kind: "orphan_group_member",
        affectedIds: orphanGroupRefs,
        context: `Group set '${groupSet.name}' references non-existent groups`,
      });
    }
  }

  const misplacedStudents = roster.students
    .filter((member) => member.enrollmentType !== "student")
    .map((member) => member.id);
  if (misplacedStudents.length > 0) {
    issues.push({
      kind: "invalid_enrollment_partition",
      affectedIds: misplacedStudents,
      context: "Non-students in students array",
    });
  }

  const misplacedStaff = roster.staff
    .filter((member) => member.enrollmentType === "student")
    .map((member) => member.id);
  if (misplacedStaff.length > 0) {
    issues.push({
      kind: "invalid_enrollment_partition",
      affectedIds: misplacedStaff,
      context: "Students in staff array",
    });
  }

  const memberIdSet = new Set(allMemberIds);
  for (const group of roster.groups) {
    const orphanMembers = group.memberIds.filter(
      (memberId) => !memberIdSet.has(memberId),
    );
    if (orphanMembers.length > 0) {
      issues.push({
        kind: "orphan_group_member",
        affectedIds: orphanMembers,
        context: `Group '${group.name}' references non-existent members`,
      });
    }
  }

  for (const groupSet of roster.groupSets) {
    validateGroupSetOriginConsistency(roster, groupSet, issues);
  }

  return { issues };
}

export function validateAssignment(
  roster: Roster,
  assignmentId: string,
  identityMode: GitIdentityMode,
): RosterValidationResult {
  return validateAssignmentWithTemplate(
    roster,
    assignmentId,
    identityMode,
    defaultRepoTemplate,
  );
}

export function validateAssignmentWithTemplate(
  roster: Roster,
  assignmentId: string,
  identityMode: GitIdentityMode,
  template: string,
): RosterValidationResult {
  const assignment = roster.assignments.find(
    (candidate) => candidate.id === assignmentId,
  );
  if (assignment === undefined) {
    return { issues: [] };
  }

  const groups = resolveAssignmentGroups(roster, assignment);
  const memberLookup = new Map(
    roster.students
      .concat(roster.staff)
      .map((member) => [member.id, member] as const),
  );
  const issues: RosterValidationIssue[] = [];

  const duplicateGroupNames = findDuplicateStrings(
    groups.map((group) => normalizeName(group.name)),
  );
  if (duplicateGroupNames.length > 0) {
    issues.push({
      kind: "duplicate_group_name_in_assignment",
      affectedIds: duplicateGroupNames,
      context: null,
    });
  }

  const memberGroupCounts = new Map<string, number>();
  const emptyGroups = new Set<string>();
  const missingGitUsernames = new Set<string>();
  const invalidGitUsernames = new Set<string>();
  const assignedActiveStudents = new Set<string>();

  for (const group of groups) {
    if (group.memberIds.length === 0) {
      emptyGroups.add(group.id);
    }

    for (const memberId of group.memberIds) {
      const member = memberLookup.get(memberId);
      if (member === undefined || member.status !== "active") {
        continue;
      }

      assignedActiveStudents.add(member.id);
      memberGroupCounts.set(
        member.id,
        (memberGroupCounts.get(member.id) ?? 0) + 1,
      );

      if (identityMode !== "username") {
        continue;
      }

      if ((member.gitUsername ?? "").trim().length === 0) {
        missingGitUsernames.add(member.id);
      } else if (member.gitUsernameStatus === "invalid") {
        invalidGitUsernames.add(member.id);
      }
    }
  }

  const duplicateMembers = sortedStrings(
    [...memberGroupCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([memberId]) => memberId),
  );
  if (duplicateMembers.length > 0) {
    issues.push({
      kind: "student_in_multiple_groups_in_assignment",
      affectedIds: duplicateMembers,
      context: null,
    });
  }

  if (emptyGroups.size > 0) {
    issues.push({
      kind: "empty_group",
      affectedIds: sortedStrings([...emptyGroups]),
      context: null,
    });
  }

  if (identityMode === "username" && missingGitUsernames.size > 0) {
    issues.push({
      kind: "missing_git_username",
      affectedIds: sortedStrings([...missingGitUsernames]),
      context: null,
    });
  }

  if (identityMode === "username" && invalidGitUsernames.size > 0) {
    issues.push({
      kind: "invalid_git_username",
      affectedIds: sortedStrings([...invalidGitUsernames]),
      context: null,
    });
  }

  const unassignedActiveStudents = roster.students
    .filter((member) => member.status === "active")
    .filter((member) => !assignedActiveStudents.has(member.id))
    .map((member) => member.id);
  if (unassignedActiveStudents.length > 0) {
    issues.push({
      kind: "unassigned_student",
      affectedIds: sortedStrings(unassignedActiveStudents),
      context: null,
    });
  }

  const repoNameMap = new Map<string, string[]>();
  for (const group of groups) {
    const repoName = computeRepoName(template, assignment, group);
    repoNameMap.set(repoName, [...(repoNameMap.get(repoName) ?? []), group.id]);
  }

  for (const [repoName, groupIds] of repoNameMap) {
    if (groupIds.length <= 1) {
      continue;
    }
    issues.push({
      kind: "duplicate_repo_name_in_assignment",
      affectedIds: sortedStrings(groupIds),
      context: repoName,
    });
  }

  return { issues };
}

export function isBlockingValidationKind(kind: RosterValidationKind): boolean {
  switch (kind) {
    case "duplicate_student_id":
    case "invalid_email":
    case "duplicate_email":
    case "duplicate_assignment_name":
    case "duplicate_group_id_in_assignment":
    case "duplicate_group_name_in_assignment":
    case "duplicate_repo_name_in_assignment":
    case "orphan_group_member":
    case "empty_group":
    case "system_group_sets_missing":
    case "invalid_enrollment_partition":
    case "invalid_group_origin":
      return true;
    case "missing_email":
    case "missing_git_username":
    case "invalid_git_username":
    case "unassigned_student":
    case "student_in_multiple_groups_in_assignment":
      return false;
  }
}

export function hasBlockingIssues(result: RosterValidationResult): boolean {
  return result.issues.some((issue) => isBlockingValidationKind(issue.kind));
}

export function blockingIssues(
  result: RosterValidationResult,
): RosterValidationIssue[] {
  return result.issues.filter((issue) => isBlockingValidationKind(issue.kind));
}

export function warningIssues(
  result: RosterValidationResult,
): RosterValidationIssue[] {
  return result.issues.filter((issue) => !isBlockingValidationKind(issue.kind));
}

// ---------------------------------------------------------------------------
// Zod schemas for boundary validation
// ---------------------------------------------------------------------------

const persistedLmsConnectionSchema = z.object({
  name: z.string(),
  provider: z.enum(lmsProviderKinds),
  baseUrl: z.string(),
  token: z.string(),
});

const persistedGitConnectionSchema = z.object({
  name: z.string(),
  provider: z.enum(gitProviderKinds),
  baseUrl: z.string().nullable(),
  token: z.string(),
  organization: z.string().nullable(),
});

const appAppearanceSchema = z.object({
  theme: z.enum(["system", "light", "dark"]),
  windowChrome: z.enum(["system", "hiddenInset"]),
});

export const persistedAppSettingsSchema = z.object({
  kind: z.literal(persistedAppSettingsKind),
  schemaVersion: z.literal(1),
  activeProfileId: z.string().nullable(),
  appearance: appAppearanceSchema,
  lmsConnections: z.array(persistedLmsConnectionSchema),
  gitConnections: z.array(persistedGitConnectionSchema),
  lastOpenedAt: z.string().nullable(),
});

const memberStatusSchema = z.enum(memberStatusKinds);
const gitUsernameStatusSchema = z.enum(gitUsernameStatusKinds);
const enrollmentTypeSchema = z.enum(enrollmentTypeKinds);
const groupOriginSchema = z.enum(groupOriginKinds);

const rosterConnectionSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("canvas"),
      courseId: z.string(),
      lastUpdated: z.string(),
    }),
    z.object({
      kind: z.literal("moodle"),
      courseId: z.string(),
      lastUpdated: z.string(),
    }),
    z.object({
      kind: z.literal("import"),
      sourceFilename: z.string(),
      lastUpdated: z.string(),
    }),
  ])
  .nullable();

const rosterMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  studentNumber: z.string().nullable(),
  gitUsername: z.string().nullable(),
  gitUsernameStatus: gitUsernameStatusSchema,
  status: memberStatusSchema,
  lmsStatus: memberStatusSchema.nullable(),
  lmsUserId: z.string().nullable(),
  enrollmentType: enrollmentTypeSchema,
  enrollmentDisplay: z.string().nullable(),
  department: z.string().nullable(),
  institution: z.string().nullable(),
  source: z.string(),
});

const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  memberIds: z.array(z.string()),
  origin: groupOriginSchema,
  lmsGroupId: z.string().nullable(),
});

const groupSelectionModeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("all"),
    excludedGroupIds: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("pattern"),
    pattern: z.string(),
    excludedGroupIds: z.array(z.string()),
  }),
]);

const groupSetConnectionSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("system"),
      systemType: z.string(),
    }),
    z.object({
      kind: z.literal("canvas"),
      courseId: z.string(),
      groupSetId: z.string(),
      lastUpdated: z.string(),
    }),
    z.object({
      kind: z.literal("moodle"),
      courseId: z.string(),
      groupingId: z.string(),
      lastUpdated: z.string(),
    }),
    z.object({
      kind: z.literal("import"),
      sourceFilename: z.string(),
      sourcePath: z.string().nullable(),
      lastUpdated: z.string(),
    }),
  ])
  .nullable();

const assignmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  groupSetId: z.string(),
});

const groupSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  groupIds: z.array(z.string()),
  connection: groupSetConnectionSchema,
  groupSelection: groupSelectionModeSchema,
});

const repositoryTemplateSchema = z.object({
  owner: z.string(),
  name: z.string(),
  visibility: z.enum(["private", "internal", "public"]),
});

const rosterSchema = z.object({
  connection: rosterConnectionSchema,
  students: z.array(rosterMemberSchema),
  staff: z.array(rosterMemberSchema),
  groups: z.array(groupSchema),
  groupSets: z.array(groupSetSchema),
  assignments: z.array(assignmentSchema),
});

export const persistedProfileSchema = z.object({
  kind: z.literal(persistedProfileKind),
  schemaVersion: z.literal(2),
  id: z.string(),
  displayName: z.string(),
  lmsConnectionName: z.string().nullable(),
  gitConnectionName: z.string().nullable(),
  courseId: z.string().nullable(),
  roster: rosterSchema,
  repositoryTemplate: repositoryTemplateSchema.nullable(),
  updatedAt: z.string(),
});

// Compile-time drift guards: ensure zod inferred types match hand-authored types
type _AppSettingsCheck =
  z.infer<typeof persistedAppSettingsSchema> extends PersistedAppSettings
    ? PersistedAppSettings extends z.infer<typeof persistedAppSettingsSchema>
      ? true
      : never
    : never;
const _appSettingsGuard: _AppSettingsCheck = true;
void _appSettingsGuard;

type _ProfileCheck =
  z.infer<typeof persistedProfileSchema> extends PersistedProfile
    ? PersistedProfile extends z.infer<typeof persistedProfileSchema>
      ? true
      : never
    : never;
const _profileGuard: _ProfileCheck = true;
void _profileGuard;

// ---------------------------------------------------------------------------
// Tabular import row schemas (consumed at parse boundary by application workflows)
// ---------------------------------------------------------------------------

export const groupSetImportRowSchema = z.object({
  group_name: z.string().min(1),
  group_id: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
});

export const groupSetExportRowSchema = z.object({
  group_set_id: z.string(),
  group_id: z.string(),
  group_name: z.string(),
  name: z.string(),
  email: z.string(),
});

export const studentImportRowSchema = z.object({
  name: z.string().min(1),
  id: z.string().optional(),
  email: z.string().optional(),
  student_number: z.string().optional(),
  git_username: z.string().optional(),
  status: z.string().optional(),
});

export type StudentImportRow = z.infer<typeof studentImportRowSchema>;

export const gitUsernameImportRowSchema = z.object({
  email: z.string().min(1),
  git_username: z.string().min(1),
});

export type GitUsernameImportRow = z.infer<typeof gitUsernameImportRowSchema>;

export const groupEditImportRowSchema = z
  .object({
    group_name: z.string().min(1),
    group_id: z.string().optional(),
    student_id: z.string().optional(),
    student_email: z.string().optional(),
  })
  .refine(
    (row) =>
      (row.student_id !== undefined && row.student_id !== "") ||
      (row.student_email !== undefined && row.student_email !== ""),
    { message: "Either student_id or student_email must be provided." },
  );

export type GroupEditImportRow = z.infer<typeof groupEditImportRowSchema>;

// ---------------------------------------------------------------------------
// Boundary validation functions
// ---------------------------------------------------------------------------

function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "$",
    message: issue.message,
  }));
}

export function validatePersistedAppSettings(
  value: unknown,
): ValidationResult<PersistedAppSettings> {
  const result = persistedAppSettingsSchema.safeParse(value);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, issues: toValidationIssues(result.error) };
}

export function validatePersistedProfile(
  value: unknown,
): ValidationResult<PersistedProfile> {
  const result = persistedProfileSchema.safeParse(value);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, issues: toValidationIssues(result.error) };
}

export function formatSmokeWorkflowMessage(source: string) {
  return `Shared workflow executed from ${source}.`;
}
