/** Groups that must never share a team. Group IDs are unique only inside one
 * course. Group names are unique only inside one group set, and names that
 * differ only in spaces or punctuation make the same slug. A team of
 * usernames has no name of its own. */
export const separateTeamGroups = [
  {
    courseId: "Course_A",
    groupId: "g_0001",
    groupName: "A B",
    teamName: "team-a-b-436f757273655f41-g_0001",
  },
  {
    courseId: "Course_B",
    groupId: "g_0001",
    groupName: "A B",
    teamName: "team-a-b-436f757273655f42-g_0001",
  },
  {
    courseId: "Course_A",
    groupId: "g_0002",
    groupName: "A-B",
    teamName: "team-a-b-436f757273655f41-g_0002",
  },
  {
    courseId: "Course_A",
    groupId: "g_0003",
    groupName: "Group 1",
    teamName: "team-group-1-436f757273655f41-g_0003",
  },
  {
    courseId: "Course_A",
    groupId: "g_0004",
    groupName: "Group 1",
    teamName: "team-group-1-436f757273655f41-g_0004",
  },
  {
    courseId: "Course_A",
    groupId: "ut_0001",
    groupName: "",
    teamName: "team-436f757273655f41-ut_0001",
  },
]
