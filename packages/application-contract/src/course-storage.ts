/** Every course-storage failure is terminal, irrespective of commit progress. */
export type CourseStorageFailure = {
  type: "course-storage"
  message: string
}

export function createCourseStorageFailure(
  message: string,
): CourseStorageFailure {
  return { type: "course-storage", message }
}
