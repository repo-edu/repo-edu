import type {
  Assignment,
  CourseInfo,
  ExportSettings,
  GitConnection,
  GitUsernameStatus,
  LmsGroupSet,
  OperationConfigs,
  ProfileSettings,
  Student,
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
// Students
// ============================================================================

export const demoStudents: Student[] = [
  {
    id: "s-emma",
    name: "Emma Chen",
    email: "echen@university.edu",
    student_number: "20240001",
    git_username: "emma-chen",
    git_username_status: VALID,
    lms_user_id: "lms-101",
    custom_fields: {},
  },
  {
    id: "s-liam",
    name: "Liam Patel",
    email: "lpatel@university.edu",
    student_number: "20240002",
    git_username: "liampatel",
    git_username_status: VALID,
    lms_user_id: "lms-102",
    custom_fields: {},
  },
  {
    id: "s-sofia",
    name: "Sofia Rodriguez",
    email: "srodriguez@university.edu",
    student_number: "20240003",
    git_username: "sofia-r",
    git_username_status: VALID,
    lms_user_id: "lms-103",
    custom_fields: {},
  },
  {
    id: "s-noah",
    name: "Noah Kim",
    email: "nkim@university.edu",
    student_number: "20240004",
    git_username: "noahkim",
    git_username_status: VALID,
    lms_user_id: "lms-104",
    custom_fields: {},
  },
  {
    id: "s-olivia",
    name: "Olivia Johnson",
    email: "ojohnson@university.edu",
    student_number: "20240005",
    git_username: "oliviaj",
    git_username_status: VALID,
    lms_user_id: "lms-105",
    custom_fields: {},
  },
  {
    id: "s-ethan",
    name: "Ethan Williams",
    email: "ewilliams@university.edu",
    student_number: "20240006",
    git_username: "ethanw",
    git_username_status: VALID,
    lms_user_id: "lms-106",
    custom_fields: {},
  },
  {
    id: "s-ava",
    name: "Ava Martinez",
    email: "amartinez@university.edu",
    student_number: "20240007",
    git_username: "ava-m",
    git_username_status: VALID,
    lms_user_id: "lms-107",
    custom_fields: {},
  },
  {
    id: "s-mason",
    name: "Mason Brown",
    email: "mbrown@university.edu",
    student_number: "20240008",
    git_username: "masonb",
    git_username_status: VALID,
    lms_user_id: "lms-108",
    custom_fields: {},
  },
  {
    id: "s-mia",
    name: "Mia Thompson",
    email: "mthompson@university.edu",
    student_number: "20240009",
    git_username: "miat",
    git_username_status: VALID,
    lms_user_id: "lms-109",
    custom_fields: {},
  },
  {
    id: "s-lucas",
    name: "Lucas Garcia",
    email: "lgarcia@university.edu",
    student_number: "20240010",
    git_username: "lucasg",
    git_username_status: VALID,
    lms_user_id: "lms-110",
    custom_fields: {},
  },
  {
    id: "s-isabella",
    name: "Isabella Davis",
    email: "idavis@university.edu",
    student_number: "20240011",
    git_username: "isabelladavis",
    git_username_status: VALID,
    lms_user_id: "lms-111",
    custom_fields: {},
  },
  {
    id: "s-aiden",
    name: "Aiden Wilson",
    email: "awilson@university.edu",
    student_number: "20240012",
    git_username: "aidenwilson",
    git_username_status: VALID,
    lms_user_id: "lms-112",
    custom_fields: {},
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
// Assignments
// ============================================================================

// CS101 assignments - all 12 students in lab teams of 3
export const cs101Assignments: Assignment[] = [
  {
    id: "lab-basics",
    name: "Lab 1: Python Basics",
    lms_group_set_id: "gs-lab-teams",
    groups: [
      {
        id: "g-basics-1",
        name: "PyStarters",
        member_ids: ["s-emma", "s-liam", "s-sofia"],
      },
      {
        id: "g-basics-2",
        name: "CodeCrafters",
        member_ids: ["s-noah", "s-olivia", "s-ethan"],
      },
      {
        id: "g-basics-3",
        name: "ByteBuddies",
        member_ids: ["s-ava", "s-mason", "s-mia"],
      },
      {
        id: "g-basics-4",
        name: "ScriptSquad",
        member_ids: ["s-lucas", "s-isabella", "s-aiden"],
      },
    ],
  },
  {
    id: "lab-functions",
    name: "Lab 2: Functions and Modules",
    lms_group_set_id: "gs-lab-teams",
    groups: [
      {
        id: "g-func-1",
        name: "PyStarters",
        member_ids: ["s-emma", "s-liam", "s-sofia"],
      },
      {
        id: "g-func-2",
        name: "CodeCrafters",
        member_ids: ["s-noah", "s-olivia", "s-ethan"],
      },
      {
        id: "g-func-3",
        name: "ByteBuddies",
        member_ids: ["s-ava", "s-mason", "s-mia"],
      },
      {
        id: "g-func-4",
        name: "ScriptSquad",
        member_ids: ["s-lucas", "s-isabella", "s-aiden"],
      },
    ],
  },
]

// CS201 assignments - project teams of 4
export const cs201Assignments: Assignment[] = [
  {
    id: "project-datavis",
    name: "Project: Data Visualization",
    lms_group_set_id: "gs-project-teams",
    groups: [
      {
        id: "g-proj-1",
        name: "DataPioneers",
        member_ids: ["s-emma", "s-noah", "s-ava", "s-lucas"],
      },
      {
        id: "g-proj-2",
        name: "PlotMasters",
        member_ids: ["s-liam", "s-olivia", "s-mason", "s-isabella"],
      },
    ],
  },
  {
    id: "project-api",
    name: "Project: REST API Client",
    lms_group_set_id: "gs-project-teams",
    groups: [
      {
        id: "g-api-1",
        name: "DataPioneers",
        member_ids: ["s-emma", "s-noah", "s-ava", "s-lucas"],
      },
      {
        id: "g-api-2",
        name: "PlotMasters",
        member_ids: ["s-liam", "s-olivia", "s-mason", "s-isabella"],
      },
    ],
  },
]

// ============================================================================
// LMS Group Sets
// ============================================================================

// CS101 group sets
export const cs101GroupSets: LmsGroupSet[] = [
  {
    id: "gs-lab-teams",
    name: "Lab Teams",
    groups: cs101Assignments[0].groups.map((group) => ({
      id: group.id,
      name: group.name,
      member_ids: group.member_ids,
    })),
  },
]

// CS201 group sets
export const cs201GroupSets: LmsGroupSet[] = [
  {
    id: "gs-project-teams",
    name: "Project Teams",
    groups: cs201Assignments[0].groups.map((group) => ({
      id: group.id,
      name: group.name,
      member_ids: group.member_ids,
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
// Course Type
// ============================================================================

export type CourseType = "cs101" | "cs201"
