import { z } from "zod"
import type {
  PersistedAppSettings,
  PersistedCourse,
  ValidationIssue,
  ValidationResult,
} from "./types.js"
import {
  enrollmentTypeKinds,
  gitProviderKinds,
  gitUsernameStatusKinds,
  groupOriginKinds,
  lmsProviderKinds,
  memberStatusKinds,
  persistedAppSettingsKind,
  persistedCourseKind,
} from "./types.js"

// ---------------------------------------------------------------------------
// Internal zod schema definitions
// ---------------------------------------------------------------------------

const persistedLmsConnectionSchema = z.object({
  name: z.string(),
  provider: z.enum(lmsProviderKinds),
  baseUrl: z.string(),
  token: z.string(),
  userAgent: z.string().optional(),
})

const persistedGitConnectionSchema = z.object({
  id: z.string(),
  provider: z.enum(gitProviderKinds),
  baseUrl: z.string(),
  token: z.string(),
})

const appAppearanceSchema = z.object({
  theme: z.enum(["system", "light", "dark"]),
  windowChrome: z.enum(["system", "hiddenInset"]),
  dateFormat: z.enum(["MDY", "DMY"]),
  timeFormat: z.enum(["12h", "24h"]),
})

export const persistedAppSettingsSchema = z.object({
  kind: z.literal(persistedAppSettingsKind),
  schemaVersion: z.literal(1),
  activeCourseId: z.string().nullable(),
  appearance: appAppearanceSchema,
  lmsConnections: z.array(persistedLmsConnectionSchema),
  gitConnections: z.array(persistedGitConnectionSchema),
  lastOpenedAt: z.string().nullable(),
  rosterColumnVisibility: z.record(z.string(), z.boolean()).default({}),
  rosterColumnSizing: z.record(z.string(), z.number()).default({}),
  groupsColumnVisibility: z.record(z.string(), z.boolean()).default({}),
  groupsColumnSizing: z.record(z.string(), z.number()).default({}),
})

const memberStatusSchema = z.enum(memberStatusKinds)
const gitUsernameStatusSchema = z.enum(gitUsernameStatusKinds)
const enrollmentTypeSchema = z.enum(enrollmentTypeKinds)
const groupOriginSchema = z.enum(groupOriginKinds)

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
  .nullable()

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
})

const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  memberIds: z.array(z.string()),
  origin: groupOriginSchema,
  lmsGroupId: z.string().nullable(),
})

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
])

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
  .nullable()

const repositoryTemplateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("remote"),
    owner: z.string(),
    name: z.string(),
    visibility: z.enum(["private", "internal", "public"]),
  }),
  z.object({
    kind: z.literal("local"),
    path: z.string(),
    visibility: z.enum(["private", "internal", "public"]),
  }),
])

const assignmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  groupSetId: z.string(),
  repositoryTemplate: repositoryTemplateSchema.nullable().optional(),
  templateCommitSha: z.string().nullable().optional(),
})

const groupSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  groupIds: z.array(z.string()),
  connection: groupSetConnectionSchema,
  groupSelection: groupSelectionModeSchema,
  repoNameTemplate: z.string().nullable().default(null),
})

const rosterSchema = z.object({
  connection: rosterConnectionSchema,
  students: z.array(rosterMemberSchema),
  staff: z.array(rosterMemberSchema),
  groups: z.array(groupSchema),
  groupSets: z.array(groupSetSchema),
  assignments: z.array(assignmentSchema),
})

export const persistedCourseSchema = z.object({
  kind: z.literal(persistedCourseKind),
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  id: z.string(),
  displayName: z.string(),
  lmsConnectionName: z.string().nullable(),
  gitConnectionId: z.string().nullable(),
  organization: z.string().nullable(),
  lmsCourseId: z.string().nullable(),
  roster: rosterSchema,
  repositoryTemplate: repositoryTemplateSchema.nullable(),
  repositoryCloneTargetDirectory: z.string().nullable().optional(),
  repositoryCloneDirectoryLayout: z
    .enum(["flat", "by-team", "by-task"])
    .nullable()
    .optional(),
  updatedAt: z.string(),
})

// Compile-time drift guards: ensure zod inferred types match hand-authored types
type _AppSettingsCheck =
  z.infer<typeof persistedAppSettingsSchema> extends PersistedAppSettings
    ? PersistedAppSettings extends z.infer<typeof persistedAppSettingsSchema>
      ? true
      : never
    : never
const _appSettingsGuard: _AppSettingsCheck = true
void _appSettingsGuard

type _CourseCheck =
  z.infer<typeof persistedCourseSchema> extends PersistedCourse
    ? PersistedCourse extends z.infer<typeof persistedCourseSchema>
      ? true
      : never
    : never
const _courseGuard: _CourseCheck = true
void _courseGuard

// ---------------------------------------------------------------------------
// Tabular import row schemas (consumed at parse boundary by application workflows)
// ---------------------------------------------------------------------------

export const groupSetImportRowSchema = z.object({
  group_name: z.string().min(1),
  group_id: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
})

export const groupSetExportRowSchema = z.object({
  group_set_id: z.string(),
  group_id: z.string(),
  group_name: z.string(),
  name: z.string(),
  email: z.string(),
})

export const studentImportRowSchema = z.object({
  name: z.string().min(1),
  id: z.string().optional(),
  email: z.string().optional(),
  student_number: z.string().optional(),
  git_username: z.string().optional(),
  status: z.string().optional(),
  role: z.string().optional(),
})

export type StudentImportRow = z.infer<typeof studentImportRowSchema>

export const gitUsernameImportRowSchema = z.object({
  email: z.string().min(1),
  git_username: z.string().min(1),
})

export type GitUsernameImportRow = z.infer<typeof gitUsernameImportRowSchema>

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
  )

export type GroupEditImportRow = z.infer<typeof groupEditImportRowSchema>

// ---------------------------------------------------------------------------
// Boundary validation functions
// ---------------------------------------------------------------------------

function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "$",
    message: issue.message,
  }))
}

export function validatePersistedAppSettings(
  value: unknown,
): ValidationResult<PersistedAppSettings> {
  const result = persistedAppSettingsSchema.safeParse(value)
  if (result.success) {
    return { ok: true, value: result.data }
  }
  return { ok: false, issues: toValidationIssues(result.error) }
}

export function validatePersistedCourse(
  value: unknown,
): ValidationResult<PersistedCourse> {
  const result = persistedCourseSchema.safeParse(value)
  if (result.success) {
    return { ok: true, value: result.data }
  }
  return { ok: false, issues: toValidationIssues(result.error) }
}

export function formatSmokeWorkflowMessage(source: string) {
  return `Shared workflow executed from ${source}.`
}
