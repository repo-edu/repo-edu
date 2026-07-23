import type {
  Assignment,
  Group,
  GroupSet,
  Roster,
  UsernameTeam,
} from "./types.js"

function resolveNamedGroups(roster: Roster, groupIds: string[]): Group[] {
  return groupIds.flatMap((groupId) => {
    const group = roster.groups.find((candidate) => candidate.id === groupId)
    return group === undefined ? [] : [group]
  })
}

function resolveUnnamedTeams(teams: UsernameTeam[]): Group[] {
  return teams.map((team) => ({
    id: team.id,
    name: team.gitUsernames.join("-"),
    memberIds: [],
    origin: "local" as const,
    lmsGroupId: null,
  }))
}

export function resolveGroupSetGroups(
  roster: Roster,
  groupSet: GroupSet,
): Group[] {
  switch (groupSet.nameMode) {
    case "named":
      return resolveNamedGroups(roster, groupSet.groupIds)
    case "unnamed":
      return resolveUnnamedTeams(groupSet.teams)
  }
}

export function resolveAssignmentGroups(
  roster: Roster,
  assignment: Assignment,
): Group[] {
  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === assignment.groupSetId,
  )
  if (groupSet === undefined) {
    return []
  }

  return resolveGroupSetGroups(roster, groupSet)
}
