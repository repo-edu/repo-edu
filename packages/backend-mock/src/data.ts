import type {
  Assignment,
  CourseInfo,
  ExportSettings,
  GitConnection,
  GitUsernameStatus,
  Group,
  GroupSet,
  LmsGroupSet,
  OperationConfigs,
  ProfileSettings,
  Roster,
  RosterMember,
} from "@repo-edu/backend-interface/types"

const VALID: GitUsernameStatus = "valid"

// ============================================================================
// Courses
// ============================================================================

export const demoCourses: CourseInfo[] = [
  { id: "48291", name: "CS 101: Introduction to Python (2026)" },
  { id: "48350", name: "CS 201: Data Structures in Python (2026)" },
]

// ============================================================================
// Roster Members (students)
// ============================================================================

export const demoStudents: RosterMember[] = [
  {
    id: "s-emma",
    name: "Emma Chen",
    email: "echen@university.edu",
    student_number: "20240001",
    git_username: "emma-chen",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-101",
    enrollment_type: "student",
    source: "lms",
  },
  {
    id: "s-liam",
    name: "Liam Patel",
    email: "lpatel@university.edu",
    student_number: "20240002",
    git_username: "liampatel",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-102",
    enrollment_type: "student",
    source: "lms",
  },
  {
    id: "s-sofia",
    name: "Sofia Rodriguez",
    email: "srodriguez@university.edu",
    student_number: "20240003",
    git_username: "sofia-r",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-103",
    enrollment_type: "student",
    source: "lms",
  },
  {
    id: "s-noah",
    name: "Noah Kim",
    email: "nkim@university.edu",
    student_number: "20240004",
    git_username: "noahkim",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-104",
    enrollment_type: "student",
    source: "lms",
  },
  {
    id: "s-olivia",
    name: "Olivia Johnson",
    email: "ojohnson@university.edu",
    student_number: "20240005",
    git_username: "oliviaj",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-105",
    enrollment_type: "student",
    source: "lms",
  },
  {
    id: "s-ethan",
    name: "Ethan Williams",
    email: "ewilliams@university.edu",
    student_number: "20240006",
    git_username: "ethanw",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-106",
    enrollment_type: "student",
    source: "lms",
  },
  {
    id: "s-ava",
    name: "Ava Martinez",
    email: "amartinez@university.edu",
    student_number: "20240007",
    git_username: "ava-m",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-107",
    enrollment_type: "student",
    source: "lms",
  },
  {
    id: "s-mason",
    name: "Mason Brown",
    email: "mbrown@university.edu",
    student_number: "20240008",
    git_username: "masonb",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-108",
    enrollment_type: "student",
    source: "lms",
  },
  {
    id: "s-mia",
    name: "Mia Thompson",
    email: "mthompson@university.edu",
    student_number: "20240009",
    git_username: "miat",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-109",
    enrollment_type: "student",
    source: "lms",
  },
  {
    id: "s-lucas",
    name: "Lucas Garcia",
    email: "lgarcia@university.edu",
    student_number: "20240010",
    git_username: "lucasg",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-110",
    enrollment_type: "student",
    source: "lms",
  },
  {
    id: "s-isabella",
    name: "Isabella Davis",
    email: "idavis@university.edu",
    student_number: "20240011",
    git_username: "isabelladavis",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-111",
    enrollment_type: "student",
    source: "lms",
  },
  {
    id: "s-aiden",
    name: "Aiden Wilson",
    email: "awilson@university.edu",
    student_number: "20240012",
    git_username: "aidenwilson",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-112",
    enrollment_type: "student",
    source: "lms",
  },
]

// CS201 students - 8 students who advanced from CS101
const cs201StudentIds = [
  "s-emma",
  "s-liam",
  "s-noah",
  "s-olivia",
  "s-ava",
  "s-mason",
  "s-lucas",
  "s-isabella",
]
export const cs201Students = demoStudents.filter((s) =>
  cs201StudentIds.includes(s.id),
)

// ============================================================================
// Staff
// ============================================================================

export const demoStaff: RosterMember[] = [
  {
    id: "staff-instructor",
    name: "Dr. Sarah Mitchell",
    email: "smitchell@university.edu",
    student_number: null,
    git_username: "smitchell",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-001",
    enrollment_type: "teacher",
    source: "lms",
  },
  {
    id: "staff-ta",
    name: "James Park",
    email: "jpark@university.edu",
    student_number: null,
    git_username: "jpark-ta",
    git_username_status: VALID,
    status: "active",
    lms_user_id: "lms-002",
    enrollment_type: "ta",
    source: "lms",
  },
]

// ============================================================================
// Top-Level Groups (CS101)
// ============================================================================

export const cs101Groups: Group[] = [
  {
    id: "g-basics-1",
    name: "PyStarters",
    member_ids: ["s-emma", "s-liam", "s-sofia"],
    origin: "lms",
    lms_group_id: "lms-g-basics-1",
  },
  {
    id: "g-basics-2",
    name: "CodeCrafters",
    member_ids: ["s-noah", "s-olivia", "s-ethan"],
    origin: "lms",
    lms_group_id: "lms-g-basics-2",
  },
  {
    id: "g-basics-3",
    name: "ByteBuddies",
    member_ids: ["s-ava", "s-mason", "s-mia"],
    origin: "lms",
    lms_group_id: "lms-g-basics-3",
  },
  {
    id: "g-basics-4",
    name: "ScriptSquad",
    member_ids: ["s-lucas", "s-isabella", "s-aiden"],
    origin: "lms",
    lms_group_id: "lms-g-basics-4",
  },
]

// ============================================================================
// Top-Level Groups (CS201)
// ============================================================================

export const cs201Groups: Group[] = [
  {
    id: "g-proj-1",
    name: "DataPioneers",
    member_ids: ["s-emma", "s-noah", "s-ava", "s-lucas"],
    origin: "lms",
    lms_group_id: "lms-g-proj-1",
  },
  {
    id: "g-proj-2",
    name: "PlotMasters",
    member_ids: ["s-liam", "s-olivia", "s-mason", "s-isabella"],
    origin: "lms",
    lms_group_id: "lms-g-proj-2",
  },
]

// ============================================================================
// System Groups — individual student groups + staff group
// ============================================================================

function makeIndividualGroups(students: RosterMember[]): Group[] {
  return students.map((s) => ({
    id: `sys-ind-${s.id}`,
    name: s.name,
    member_ids: [s.id],
    origin: "system" as const,
    lms_group_id: null,
  }))
}

function makeStaffGroup(staff: RosterMember[]): Group {
  return {
    id: "sys-staff",
    name: "Staff",
    member_ids: staff.map((s) => s.id),
    origin: "system" as const,
    lms_group_id: null,
  }
}

export const cs101SystemGroups: Group[] = [
  ...makeIndividualGroups(demoStudents),
  makeStaffGroup(demoStaff),
]

export const cs201SystemGroups: Group[] = [
  ...makeIndividualGroups(cs201Students),
  makeStaffGroup(demoStaff),
]

// ============================================================================
// Group Sets (local roster group sets referencing group IDs)
// ============================================================================

export const cs101RosterGroupSets: GroupSet[] = [
  {
    id: "gs-lab-teams",
    name: "Lab Teams",
    group_ids: cs101Groups.map((g) => g.id),
    connection: {
      kind: "canvas",
      course_id: "48291",
      group_set_id: "gs-lab-teams",
      last_updated: new Date().toISOString(),
    },
    group_selection: { kind: "all", excluded_group_ids: [] },
  },
]

export const cs201RosterGroupSets: GroupSet[] = [
  {
    id: "gs-project-teams",
    name: "Project Teams",
    group_ids: cs201Groups.map((g) => g.id),
    connection: {
      kind: "canvas",
      course_id: "48350",
      group_set_id: "gs-project-teams",
      last_updated: new Date().toISOString(),
    },
    group_selection: { kind: "all", excluded_group_ids: [] },
  },
]

// System group sets
export const cs101SystemGroupSets: GroupSet[] = [
  {
    id: "sys-gs-individual",
    name: "Individual Students",
    group_ids: cs101SystemGroups
      .filter((g) => g.id.startsWith("sys-ind-"))
      .map((g) => g.id),
    connection: { kind: "system", system_type: "individual_students" },
    group_selection: { kind: "all", excluded_group_ids: [] },
  },
  {
    id: "sys-gs-staff",
    name: "Staff",
    group_ids: [makeStaffGroup(demoStaff).id],
    connection: { kind: "system", system_type: "staff" },
    group_selection: { kind: "all", excluded_group_ids: [] },
  },
]

export const cs201SystemGroupSets: GroupSet[] = [
  {
    id: "sys-gs-individual",
    name: "Individual Students",
    group_ids: cs201SystemGroups
      .filter((g) => g.id.startsWith("sys-ind-"))
      .map((g) => g.id),
    connection: { kind: "system", system_type: "individual_students" },
    group_selection: { kind: "all", excluded_group_ids: [] },
  },
  {
    id: "sys-gs-staff",
    name: "Staff",
    group_ids: [makeStaffGroup(demoStaff).id],
    connection: { kind: "system", system_type: "staff" },
    group_selection: { kind: "all", excluded_group_ids: [] },
  },
]

// ============================================================================
// Assignments (new shape: no embedded groups, no assignment_type)
// ============================================================================

export const cs101Assignments: Assignment[] = [
  {
    id: "lab-basics",
    name: "lab-1",
    group_set_id: "gs-lab-teams",
  },
  {
    id: "lab-functions",
    name: "lab-2",
    group_set_id: "gs-lab-teams",
  },
]

export const cs201Assignments: Assignment[] = [
  {
    id: "project-datavis",
    name: "project-1",
    group_set_id: "gs-project-teams",
  },
  {
    id: "project-api",
    name: "project-2",
    group_set_id: "gs-project-teams",
  },
]

// ============================================================================
// LMS Group Sets (for fetch simulation — stays as LmsGroupSet[])
// ============================================================================

export const cs101GroupSets: LmsGroupSet[] = [
  {
    id: "gs-lab-teams",
    name: "Lab Teams",
    groups: cs101Groups.map((g) => ({
      id: g.lms_group_id ?? g.id,
      name: g.name,
      member_ids: [...g.member_ids],
    })),
  },
]

export const cs201GroupSets: LmsGroupSet[] = [
  {
    id: "gs-project-teams",
    name: "Project Teams",
    groups: cs201Groups.map((g) => ({
      id: g.lms_group_id ?? g.id,
      name: g.name,
      member_ids: [...g.member_ids],
    })),
  },
]

// ============================================================================
// Connections
// ============================================================================

export const demoGitConnection: GitConnection = {
  server_type: "GitHub",
  connection: {
    access_token: "demo-token",
    base_url: null,
    user: "dr-instructor",
  },
  identity_mode: "username",
}

// ============================================================================
// Default Settings
// ============================================================================

export const defaultOperations: OperationConfigs = {
  target_org: "cs-python-course",
  repo_name_template: "{assignment}-{group}",
  create: {
    template_org: "python-course-templates",
  },
  clone: {
    target_dir: "~/cs101/submissions",
    directory_layout: "by-team",
  },
  delete: {},
}

export const defaultExports: ExportSettings = {
  output_folder: "/demo/exports",
  output_csv: true,
  output_xlsx: true,
  output_yaml: true,
  csv_file: "student-info.csv",
  xlsx_file: "student-info.xlsx",
  yaml_file: "students.yaml",
  member_option: "(email, gitid)",
  include_group: true,
  include_member: true,
  include_initials: false,
  full_groups: true,
}

export const createProfileSettings = (course: CourseInfo): ProfileSettings => ({
  course,
  git_connection: "demo-github",
  operations: { ...defaultOperations },
  exports: { ...defaultExports },
})

// ============================================================================
// Roster Builders
// ============================================================================

const nowIso = () => new Date().toISOString()

export function buildCs101Roster(): Roster {
  return {
    connection: {
      kind: "canvas",
      course_id: "48291",
      last_updated: nowIso(),
    },
    students: demoStudents.map((s) => ({ ...s })),
    staff: demoStaff.map((s) => ({ ...s })),
    groups: [
      ...cs101Groups.map((g) => ({
        ...g,
        member_ids: [...g.member_ids],
      })),
      ...cs101SystemGroups.map((g) => ({
        ...g,
        member_ids: [...g.member_ids],
      })),
    ],
    group_sets: [
      ...cs101RosterGroupSets.map((gs) => ({
        ...gs,
        group_ids: [...gs.group_ids],
      })),
      ...cs101SystemGroupSets.map((gs) => ({
        ...gs,
        group_ids: [...gs.group_ids],
      })),
    ],
    assignments: cs101Assignments.map((a) => ({ ...a })),
  }
}

export function buildCs201Roster(): Roster {
  return {
    connection: {
      kind: "canvas",
      course_id: "48350",
      last_updated: nowIso(),
    },
    students: cs201Students.map((s) => ({ ...s })),
    staff: demoStaff.map((s) => ({ ...s })),
    groups: [
      ...cs201Groups.map((g) => ({
        ...g,
        member_ids: [...g.member_ids],
      })),
      ...cs201SystemGroups.map((g) => ({
        ...g,
        member_ids: [...g.member_ids],
      })),
    ],
    group_sets: [
      ...cs201RosterGroupSets.map((gs) => ({
        ...gs,
        group_ids: [...gs.group_ids],
      })),
      ...cs201SystemGroupSets.map((gs) => ({
        ...gs,
        group_ids: [...gs.group_ids],
      })),
    ],
    assignments: cs201Assignments.map((a) => ({ ...a })),
  }
}

// ============================================================================
// Course Type
// ============================================================================

export type CourseType = "cs101" | "cs201"
