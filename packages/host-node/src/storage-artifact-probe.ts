import type { CourseStore } from "@repo-edu/application/course-store"

export function isStorageArtifactProbe(): boolean {
  return process.env.REPO_EDU_STORAGE_ARTIFACT_PROBE === "1"
}

/** The production adapter returns only after its transaction commits and closes. */
export async function runStorageArtifactProbe(
  courseStore: CourseStore,
  replaceSettings?: () => Promise<void>,
): Promise<void> {
  const courses = await courseStore.listCourses()
  if (courses.length !== 0) {
    throw new Error(
      "The storage artifact probe requires an empty course database.",
    )
  }
  await replaceSettings?.()
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(
      `${JSON.stringify({
        marker: "repo-edu-storage-artifact",
        runtime: process.versions.electron
          ? "electron"
          : process.versions.bun
            ? "bun"
            : "node",
        settingsReplaced: replaceSettings !== undefined,
      })}\n`,
      (error) => (error ? reject(error) : resolve()),
    )
  })
}
