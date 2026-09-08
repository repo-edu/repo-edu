import type { CourseSaveStamp } from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"

/**
 * Application-owned storage for complete courses.
 *
 * A missing load is null. Save inserts revision zero into an absent row or
 * replaces the row matching a later revision. It returns only the committed
 * stamp, after the connection is released. Delete ends the row's lifetime.
 * The shared database adapter throws CourseStorageFailure for every storage
 * failure, including invalid content and row-state mismatches. Actions take
 * no cancellation signal: each one runs as a single transaction that nothing
 * can interrupt, so the calling workflow owns cancellation before and after
 * the call.
 */
export type CourseStore = {
  listCourses(): Promise<PersistedCourse[]> | PersistedCourse[]
  loadCourse(
    courseId: string,
  ): Promise<PersistedCourse | null> | PersistedCourse | null
  saveCourse(
    course: PersistedCourse,
  ): Promise<CourseSaveStamp> | CourseSaveStamp
  deleteCourse(courseId: string): Promise<void> | void
}
