import type {
  ActiveTab,
  CourseKind,
  DocumentKind,
} from "@repo-edu/domain/types"

export type DocumentTabVisibility = {
  roster: boolean
  groupsAssignments: boolean
  analysis: boolean
}

export function resolveDocumentTabVisibility(
  documentKind: DocumentKind | null,
  courseKind: CourseKind | null,
): DocumentTabVisibility {
  if (documentKind === "analysis") {
    return {
      roster: false,
      groupsAssignments: false,
      analysis: true,
    }
  }

  if (documentKind === "course" && courseKind === "repobee") {
    return {
      roster: false,
      groupsAssignments: true,
      analysis: true,
    }
  }

  if (documentKind === "course") {
    return {
      roster: true,
      groupsAssignments: true,
      analysis: true,
    }
  }

  return {
    roster: false,
    groupsAssignments: false,
    analysis: false,
  }
}

export function resolveSupportedActiveTab(
  activeTab: ActiveTab,
  documentKind: DocumentKind | null,
  courseKind: CourseKind | null,
): ActiveTab {
  if (documentKind === null) return activeTab

  const visibility = resolveDocumentTabVisibility(documentKind, courseKind)
  if (activeTab === "roster" && visibility.roster) return activeTab
  if (activeTab === "groups-assignments" && visibility.groupsAssignments) {
    return activeTab
  }
  if (activeTab === "analysis" && visibility.analysis) return activeTab
  return visibility.groupsAssignments ? "groups-assignments" : "analysis"
}
