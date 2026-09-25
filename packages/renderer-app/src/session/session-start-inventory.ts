export type SessionStartDefinition = {
  readonly control: string
  readonly where: string
  readonly starts: string
  readonly cancel: string
}

/** Teacher controls that may start session work. Lifecycle starts are separate. */
export const sessionStartInventory = {
  analysisStart: {
    control: "Start",
    where: "Analysis sidebar",
    starts:
      "`analysis.discoverRepos`, then `analysis.run` for all repositories",
    cancel: "Cancel Search, then Cancel",
  },
  analysisRun: {
    control: "Run Analysis, Re-run Analysis",
    where: "Analysis sidebar",
    starts: "`analysis.run` for all repositories",
    cancel: "Cancel",
  },
  analysisSearch: {
    control: "Search, Re-search",
    where: "Analysis sidebar",
    starts: "`analysis.discoverRepos`",
    cancel: "Cancel Search",
  },
  analysisBrowse: {
    control: "Browse (search folder)",
    where: "Analysis sidebar",
    starts: "`pickDirectory`, then update the chosen path only",
    cancel: "none",
  },
  analysisSelected: {
    control: "Analyse selected repository",
    where: "Analysis sidebar",
    starts: "`analysis.run` for one repository",
    cancel: "Cancel",
  },
  cloneAllSearch: {
    control: "Search, or Enter in namespace or name filter",
    where: "Clone All panel",
    starts: "`repo.listNamespace`",
    cancel: "Cancel",
  },
  cloneAllBrowse: {
    control: "Browse (target directory)",
    where: "Clone All panel",
    starts: "`pickDirectory`",
    cancel: "none",
  },
  cloneAll: {
    control: "Clone",
    where: "Clone All panel",
    starts: "`repo.bulkClone`",
    cancel: "command Cancel",
  },
  repositoryCreate: {
    control: "Create",
    where: "Repository operation fields",
    starts: "`repo.create`",
    cancel: "command Cancel",
  },
  repositoryClone: {
    control: "Clone",
    where: "Repository operation fields",
    starts: "`repo.clone`",
    cancel: "command Cancel",
  },
  repositoryUpdate: {
    control: "Update",
    where: "Repository operation fields",
    starts: "`repo.update`",
    cancel: "command Cancel",
  },
  repositoryBrowse: {
    control: "Browse (template repository)",
    where: "Repository operation fields",
    starts: "`pickDirectory`",
    cancel: "none",
  },
  studentsPreview: {
    control: "Preview, Refresh Preview",
    where: "Import students dialog",
    starts: "`roster.importFromLms`",
    cancel: "close control",
  },
  groupSetsLoad: {
    control: "Load group sets",
    where: "Connect group set dialog",
    starts: "`groupSet.fetchAvailableFromLms`",
    cancel: "close control",
  },
  groupSetPreview: {
    control: "Preview, Refresh Preview",
    where: "Connect group set dialog",
    starts: "`groupSet.connectFromLms`, `groupSet.syncFromLms`",
    cancel: "close control",
  },
  studentsBrowse: {
    control: "Browse",
    where: "Import students dialog",
    starts: "`pickUserFile`",
    cancel: "none",
  },
  gitUsernamesBrowse: {
    control: "Browse",
    where: "Git usernames dialog",
    starts: "`pickUserFile`",
    cancel: "none",
  },
  groupSetBrowse: {
    control: "Browse",
    where: "Import group set dialog",
    starts: "`pickUserFile`, then `groupSet.previewImportFromFile`",
    cancel: "none",
  },
  studentsImport: {
    control: "Import",
    where: "Import students dialog",
    starts: "`roster.importFromFile`",
    cancel: "command Cancel",
  },
  groupSetImport: {
    control: "Import",
    where: "Import group set dialog",
    starts: "`groupSet.importFromFile`",
    cancel: "command Cancel",
  },
  gitUsernamesImport: {
    control: "Import",
    where: "Git usernames dialog",
    starts: "`gitUsernames.import`",
    cancel: "command Cancel",
  },
  studentsExport: {
    control: "Export",
    where: "Students tab",
    starts: "`roster.exportMembers`",
    cancel: "none",
  },
  groupSetExport: {
    control: "Export",
    where: "Group set sidebar",
    starts: "`groupSet.export`",
    cancel: "none",
  },
  home: {
    control: "Home",
    where: "Top bar, course switcher",
    starts: "surface change to Home",
    cancel: "none",
  },
  recentRepositories: {
    control: "Open recent repository folder",
    where: "Course switcher",
    starts: "surface change to the folder",
    cancel: "none",
  },
  recentSubmission: {
    control: "Open recent submission folder",
    where: "Course switcher",
    starts:
      "surface change to the submission, then `analysis.listFolderFiles` only when no listing is held for that folder and its extensions",
    cancel: "none",
  },
  openRepositories: {
    control: "Open folder of repositories",
    where: "Home view",
    starts: "`pickDirectory`, then surface change",
    cancel: "none",
  },
  openSubmission: {
    control: "Open student submission folder",
    where: "Course switcher, Home view",
    starts:
      "`pickDirectory`, then surface change, then `analysis.listFolderFiles`",
    cancel: "none",
  },
  courseOpen: {
    control: "Open course",
    where: "Course switcher",
    starts: "`course.load`",
    cancel: "none",
  },
  courseNew: {
    control:
      "Set up a course from your LMS, Set up a course from a RepoBee student list or Enter in the course-name field",
    where: "Home view",
    starts: "`course.save`, then `course.list`",
    cancel: "none",
  },
  courseRename: {
    control: "Rename",
    where: "Course switcher",
    starts: "`course.load` when needed, then `course.save` and `course.list`",
    cancel: "none",
  },
  courseDuplicate: {
    control: "Duplicate",
    where: "Course switcher",
    starts: "`course.load` when needed, then `course.save` and `course.list`",
    cancel: "none",
  },
  courseDelete: {
    control: "Delete",
    where: "Course switcher",
    starts:
      "`course.delete`, fallback surface change when needed, then `course.list`",
    cancel: "none",
  },
  submissionRefresh: {
    control: "Refresh",
    where: "Submission tab",
    starts: "`analysis.listFolderFiles`",
    cancel: "none",
  },
  questionsLoad: {
    control: "Load questions, Refresh questions",
    where: "Examination view",
    starts:
      "`examination.prepareSubmissionSource` as needed, then `examination.lookupQuestions` and `examination.lookupQuestionSummaries`",
    cancel: "none",
  },
  questionsGenerate: {
    control: "Generate questions, Re-generate",
    where: "Examination view",
    starts:
      "preparation and lookup as needed, then `examination.generateQuestions`",
    cancel: "Stop",
  },
  archiveImport: {
    control: "Import archive",
    where: "Examination view",
    starts: "`pickUserFile`, then `examination.archive.import`",
    cancel: "command Cancel",
  },
  archiveExport: {
    control: "Export archive",
    where: "Examination view",
    starts: "`pickSaveTarget`, then `examination.archive.export`",
    cancel: "none",
  },
} as const satisfies Record<string, SessionStartDefinition>

export type SessionStartId = keyof typeof sessionStartInventory
