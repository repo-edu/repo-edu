type CourseRemovalListener = (courseId: string) => void

const courseRemovalListeners = new Set<CourseRemovalListener>()

export function subscribeCourseRemoval(
  listener: CourseRemovalListener,
): () => void {
  courseRemovalListeners.add(listener)
  return () => {
    courseRemovalListeners.delete(listener)
  }
}

export function publishCourseRemoval(courseId: string): void {
  const errors: unknown[] = []
  for (const listener of [...courseRemovalListeners]) {
    try {
      listener(courseId)
    } catch (error) {
      errors.push(error)
    }
  }
  for (const error of errors) {
    console.error("Course-removal subscriber failed", error)
  }
}
