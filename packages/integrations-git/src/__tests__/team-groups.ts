/** Groups that must never share a team. Group names are unique only inside
 * one group set, and names that differ only in spaces or punctuation make the
 * same slug. A team of usernames has no name of its own. */
export const separateTeamGroups = [
  { groupId: "g_0001", groupName: "A B", teamName: "team-a-b-g_0001" },
  { groupId: "g_0002", groupName: "A-B", teamName: "team-a-b-g_0002" },
  { groupId: "g_0003", groupName: "Group 1", teamName: "team-group-1-g_0003" },
  { groupId: "g_0004", groupName: "Group 1", teamName: "team-group-1-g_0004" },
  { groupId: "ut_0001", groupName: "", teamName: "team-ut_0001" },
]
