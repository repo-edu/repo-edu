import type {
  CourseChangingCommandId,
  ExclusiveCommandInput,
  ExclusiveCommandResult,
  Immutable,
  RecordedRepositoriesByAssignment,
} from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"

type Composer<K extends CourseChangingCommandId> = (
  input: ExclusiveCommandInput<K>,
  result: ExclusiveCommandResult<K>,
) => Immutable<PersistedCourse>

function repositoryCourse(
  course: Immutable<PersistedCourse>,
  recorded: Immutable<RecordedRepositoriesByAssignment>,
  templateShas: Readonly<Record<string, string>> = {},
): Immutable<PersistedCourse> {
  return {
    ...course,
    roster: {
      ...course.roster,
      assignments: course.roster.assignments.map((assignment) => {
        const incoming = recorded[assignment.id]
        const templateCommitSha = templateShas[assignment.id]
        if (incoming === undefined && templateCommitSha === undefined)
          return assignment
        const groupSet = course.roster.groupSets.find(
          (candidate) => candidate.id === assignment.groupSetId,
        )
        const validIds = new Set(
          groupSet === undefined
            ? []
            : groupSet.nameMode === "named"
              ? groupSet.groupIds
              : groupSet.teams.map((team) => team.id),
        )
        return {
          ...assignment,
          ...(incoming === undefined
            ? {}
            : {
                repositories: Object.fromEntries(
                  Object.entries({
                    ...assignment.repositories,
                    ...incoming,
                  }).filter(([id]) => validIds.has(id)),
                ),
              }),
          ...(templateCommitSha === undefined ? {} : { templateCommitSha }),
        }
      }),
    },
  }
}

const composers: { [K in CourseChangingCommandId]: Composer<K> } = {
  "roster.importFromFile": ({ course }, result) => ({
    ...course,
    roster: result.roster,
    idSequences: result.idSequences,
  }),
  "groupSet.importFromFile": (_input, result) => result,
  "gitUsernames.import": ({ course }, roster) => ({ ...course, roster }),
  "repo.create": ({ course }, result) =>
    repositoryCourse(
      course,
      result.recordedRepositories,
      result.templateCommitShas,
    ),
  "repo.clone": ({ course }, result) =>
    repositoryCourse(course, result.recordedRepositories),
  "repo.update": ({ course, assignmentId }, result) =>
    repositoryCourse(
      course,
      result.recordedRepositories,
      result.templateCommitSha === null
        ? {}
        : { [assignmentId]: result.templateCommitSha },
    ),
}

/** The official result is consumed once, before durable save. Features receive
 * the resulting complete course and never repeat this composition. */
export function composeCourseCommandTransition<
  K extends CourseChangingCommandId,
>(
  command: K,
  input: ExclusiveCommandInput<K>,
  result: ExclusiveCommandResult<K>,
): PersistedCourse {
  const next = composers[command](input, result)
  if (next.id !== input.course.id || next.revision !== input.course.revision)
    throw new Error(
      "A course transition must preserve its input identity and revision.",
    )
  return structuredClone(next) as PersistedCourse
}
