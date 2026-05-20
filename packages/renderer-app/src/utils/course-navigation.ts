import type { ActiveTab, CourseBacking } from "@repo-edu/domain/types"

export type CourseTabVisibility = {
  roster: boolean
  groupsAssignments: boolean
  analysis: boolean
}

export function resolveTabVisibility(
  backing: CourseBacking | undefined,
): CourseTabVisibility {
  if (backing === undefined) {
    return {
      roster: false,
      groupsAssignments: false,
      analysis: false,
    }
  }

  if (backing === null) {
    return {
      roster: false,
      groupsAssignments: false,
      analysis: true,
    }
  }

  if (backing === "repobee") {
    return {
      roster: false,
      groupsAssignments: true,
      analysis: true,
    }
  }

  return {
    roster: true,
    groupsAssignments: true,
    analysis: true,
  }
}

export function resolveSupportedActiveTab(
  activeTab: ActiveTab,
  backing: CourseBacking | undefined,
): ActiveTab {
  if (backing === undefined) return activeTab

  const visibility = resolveTabVisibility(backing)
  if (activeTab === "roster" && visibility.roster) return activeTab
  if (activeTab === "groups-assignments" && visibility.groupsAssignments) {
    return activeTab
  }
  if (activeTab === "analysis" && visibility.analysis) return activeTab
  return visibility.groupsAssignments ? "groups-assignments" : "analysis"
}
