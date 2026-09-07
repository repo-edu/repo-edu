import type { CommitPersistencePreparation } from "@repo-edu/application-contract"
import type { SessionPersistence } from "./session-persistence.js"
import type { SessionSettings } from "./session-settings.js"

/** The caller owns a command or close turn with worker starts already closed. */
export async function prepareSessionPersistence(
  settings: Pick<SessionSettings, "claim">,
  courses: Pick<SessionPersistence, "claim">,
  commit: CommitPersistencePreparation,
  canContinue: () => boolean,
): Promise<void> {
  const [{ credentials, preferences }, course] = await Promise.all([
    settings.claim(),
    courses.claim(),
  ])
  if (!canContinue()) throw new Error("The preparation turn has retired.")
  const result = await commit({
    ...(credentials ? { credentials: credentials.snapshot } : {}),
    ...(preferences ? { preferences: preferences.snapshot } : {}),
    ...(course ? { course: course.snapshot } : {}),
  })
  if (!canContinue()) throw new Error("The preparation turn has retired.")
  if (
    course
      ? result.course?.courseId !== course.snapshot.id
      : result.course !== undefined
  )
    throw new Error(
      "Preparation returned a stamp for a different course claim.",
    )
  // No input capture can run until every renderer baseline and stamp lands.
  if (course && result.course) await course.apply(result.course)
  await credentials?.apply(undefined)
  await preferences?.apply(undefined)
}
