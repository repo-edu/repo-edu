import type {
  CourseActions,
  StoreGet,
  StoreInternals,
  StoreSet,
} from "./types.js"

export function createMetadataActionsSlice(
  _set: StoreSet,
  _get: StoreGet,
  internals: StoreInternals,
): Pick<
  CourseActions,
  | "setCourseId"
  | "setLmsConnectionName"
  | "setGitConnectionId"
  | "setOrganization"
  | "setRepositoryTemplate"
  | "setRepositoryCloneTargetDirectory"
  | "setRepositoryCloneDirectoryLayout"
  | "setDisplayName"
> {
  return {
    setCourseId: (courseId) => {
      _set((draft) => {
        if (draft.course) draft.course.lmsCourseId = courseId
      })
      internals.markCourseMutated()
    },

    setLmsConnectionName: (name) => {
      _set((draft) => {
        if (draft.course) draft.course.lmsConnectionName = name
      })
      internals.markCourseMutated()
    },

    setGitConnectionId: (id) => {
      _set((draft) => {
        if (draft.course) draft.course.gitConnectionId = id
      })
      internals.markCourseMutated()
    },

    setOrganization: (organization) => {
      _set((draft) => {
        if (draft.course) draft.course.organization = organization
      })
      internals.markCourseMutated()
    },

    setRepositoryTemplate: (template) => {
      _set((draft) => {
        if (draft.course) draft.course.repositoryTemplate = template
      })
      internals.markCourseMutated()
    },

    setRepositoryCloneTargetDirectory: (targetDirectory) => {
      _set((draft) => {
        if (draft.course) {
          draft.course.repositoryCloneTargetDirectory = targetDirectory
        }
      })
      internals.markCourseMutated()
    },

    setRepositoryCloneDirectoryLayout: (layout) => {
      _set((draft) => {
        if (draft.course) {
          draft.course.repositoryCloneDirectoryLayout = layout
        }
      })
      internals.markCourseMutated()
    },

    setDisplayName: (name) => {
      _set((draft) => {
        if (draft.course) draft.course.displayName = name
      })
      internals.markCourseMutated()
    },
  }
}
