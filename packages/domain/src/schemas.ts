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
  memberStatusKinds,
  persistedAppSettingsKind,
  persistedCourseKind,
} from "./types.js"

// ---------------------------------------------------------------------------
// Internal zod schema definitions
// ---------------------------------------------------------------------------

const persistedLmsConnectionSchema = z.object({
  name: z.string(),
  provider: z.enum(["canvas", "moodle"]),
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

const persistedWindowStateSchema = z.object({
  width: z.number(),
  height: z.number(),
})

export const persistedAppSettingsSchema = z.object({
  kind: z.literal(persistedAppSettingsKind),
  schemaVersion: z.literal(1),
  activeCourseId: z.string().nullable(),
  activeTab: z.enum(["roster", "groups-assignments"]).default("roster"),
  appearance: appAppearanceSchema,
  window: persistedWindowStateSchema.default({ width: 1180, height: 760 }),
  lmsConnections: z.array(persistedLmsConnectionSchema),
  gitConnections: z.array(persistedGitConnectionSchema),
  lastOpenedAt: z.string().nullable(),
  rosterColumnVisibility: z.record(z.string(), z.boolean()).default({}),
  rosterColumnSizing: z.record(z.string(), z.number()).default({}),
  groupsSidebarSize: z.number().nullable().default(null),
})

const memberStatusSchema = z.enum(memberStatusKinds)
const gitUsernameStatusSchema = z.enum(gitUsernameStatusKinds)
const enrollmentTypeSchema = z.enum(enrollmentTypeKinds)
const groupOriginSchema = z.enum(groupOriginKinds)
const localMemberIdSchema = z.string().regex(/^m_\d{4,}$/)
const localGroupIdSchema = z.string().regex(/^g_\d{4,}$/)
const localGroupSetIdSchema = z.string().regex(/^gs_\d{4,}$/)

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
  id: localMemberIdSchema,
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
  id: localGroupIdSchema,
  name: z.string(),
  memberIds: z.array(z.string()),
  origin: groupOriginSchema,
  lmsGroupId: z.string().nullable(),
})

const localTeamIdSchema = z.string().regex(/^ut_\d{4,}$/)

const usernameTeamSchema = z.object({
  id: localTeamIdSchema,
  gitUsernames: z.array(z.string().trim().min(1)).nonempty(),
})

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
  groupSetId: localGroupSetIdSchema,
  repositoryTemplate: repositoryTemplateSchema.nullable().optional(),
  templateCommitSha: z.string().nullable().optional(),
})

const groupSetCommon = {
  id: localGroupSetIdSchema,
  name: z.string(),
  connection: groupSetConnectionSchema,
  repoNameTemplate: z.string().nullable().default(null),
  columnVisibility: z.record(z.string(), z.boolean()).default({}),
  columnSizing: z.record(z.string(), z.number()).default({}),
}

const namedGroupSetSchema = z.object({
  ...groupSetCommon,
  nameMode: z.literal("named"),
  groupIds: z.array(localGroupIdSchema),
})

const unnamedGroupSetSchema = z.object({
  ...groupSetCommon,
  nameMode: z.literal("unnamed"),
  teams: z.array(usernameTeamSchema),
})

const groupSetSchema = z
  .discriminatedUnion("nameMode", [namedGroupSetSchema, unnamedGroupSetSchema])
  .superRefine((groupSet, context) => {
    if (
      groupSet.nameMode === "unnamed" &&
      groupSet.repoNameTemplate?.includes("{group}") === true
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repoNameTemplate"],
        message: "The {group} token is not valid for unnamed group sets.",
      })
    }
  })

const rosterSchema = z.object({
  connection: rosterConnectionSchema,
  students: z.array(rosterMemberSchema),
  staff: z.array(rosterMemberSchema),
  groups: z.array(groupSchema),
  groupSets: z.array(groupSetSchema),
  assignments: z.array(assignmentSchema),
})

const idSequencesSchema = z.object({
  nextGroupSeq: z.number().int().positive(),
  nextGroupSetSeq: z.number().int().positive(),
  nextTeamSeq: z.number().int().positive(),
  nextMemberSeq: z.number().int().positive(),
  nextAssignmentSeq: z.number().int().positive(),
})

export const persistedCourseSchema = z.object({
  kind: z.literal(persistedCourseKind),
  schemaVersion: z.literal(2),
  revision: z.number().int().nonnegative(),
  id: z.string(),
  displayName: z.string(),
  lmsConnectionName: z.string().nullable(),
  gitConnectionId: z.string().nullable(),
  organization: z.string().nullable(),
  lmsCourseId: z.string().nullable(),
  idSequences: idSequencesSchema,
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
  name: z.string().optional(),
  email: z.string().optional(),
  git_username: z.string().optional(),
})

export const groupSetExportRowSchema = z.object({
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
