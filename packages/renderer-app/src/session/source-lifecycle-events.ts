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
  for (const listener of [...courseRemovalListeners]) {
    listener(courseId)
  }
}
