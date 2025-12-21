import { formatError } from "../services/commandUtils"
import * as lmsService from "../services/lmsService"
import { useLmsFormStore, useOutputStore } from "../stores"
import { validateLmsConnection } from "../validation/forms"
import { handleProgressMessage, useProgressChannel } from "./useProgressChannel"

/**
 * Hook providing LMS-related actions (verify course, generate files).
 */
export function useLmsActions() {
  const lmsForm = useLmsFormStore()
  const output = useOutputStore()

  /**
   * Verify a single course by index in the courses array.
   */
  const verifyCourse = async (courseIndex: number) => {
    const lms = lmsForm.getState()
    const course = lms.courses[courseIndex]
    if (!course) return

    // Validate connection settings before verifying
    const validation = validateLmsConnection(lms)
    if (!validation.valid) {
      output.appendWithNewline(
        "⚠ Cannot verify: fix LMS connection settings first",
      )
      lmsForm.setCourseStatus(courseIndex, "failed")
      return
    }

    if (!course.id.trim()) {
      lmsForm.setCourseStatus(courseIndex, "failed")
      return
    }

    const lmsLabel = lms.lmsType || "LMS"
    output.appendWithNewline(`Verifying ${lmsLabel} course ${course.id}...`)
    lmsForm.setCourseStatus(courseIndex, "verifying")

    try {
      const result = await lmsService.verifyLmsCourse({
        base_url: lms.urlOption === "CUSTOM" ? lms.customUrl : lms.baseUrl,
        access_token: lms.accessToken,
        course_id: course.id,
        lms_type: lms.lmsType,
      })

      lmsForm.updateCourse(courseIndex, {
        name: result.course_name,
        status: "verified",
      })
      output.appendWithNewline(
        `✓ ${lmsLabel} course verified: ${result.course_name}`,
      )
    } catch (error: unknown) {
      const { message, details } = formatError(error)
      lmsForm.setCourseStatus(courseIndex, "failed")
      output.appendWithNewline(
        `✗ Error verifying course ${course.id}: ${message}`,
      )
      if (details) {
        output.appendWithNewline(details)
      }
    }
  }

  /**
   * Verify all courses that are pending.
   */
  const verifyAllCourses = async () => {
    const lms = lmsForm.getState()
    const pendingIndices = lms.courses
      .map((c, i) => (c.status === "pending" && c.id.trim() ? i : -1))
      .filter((i) => i >= 0)

    for (const index of pendingIndices) {
      await verifyCourse(index)
    }
  }

  const handleGenerateFiles = async () => {
    const lms = lmsForm.getState()

    // Get the first verified course for generation
    const verifiedCourse = lms.courses.find((c) => c.status === "verified")
    if (!verifiedCourse) {
      output.appendWithNewline(
        "⚠ No verified course available. Please verify a course first.",
      )
      return
    }

    output.appendWithNewline(
      `Generating student info files for course ${verifiedCourse.id}...`,
    )

    try {
      const progress = useProgressChannel({
        onProgress: (line) =>
          handleProgressMessage(
            line,
            output.appendWithNewline,
            output.updateLastLine,
          ),
      })

      const result = await lmsService.generateLmsFiles(
        {
          base_url: lms.urlOption === "CUSTOM" ? lms.customUrl : lms.baseUrl,
          access_token: lms.accessToken,
          course_id: verifiedCourse.id,
          lms_type: lms.lmsType,
          yaml_file: lms.yamlFile,
          output_folder: lms.outputFolder,
          csv_file: lms.csvFile,
          xlsx_file: lms.xlsxFile,
          member_option: lms.memberOption,
          include_group: lms.includeGroup,
          include_member: lms.includeMember,
          include_initials: lms.includeInitials,
          full_groups: lms.fullGroups,
          csv: lms.csv,
          xlsx: lms.xlsx,
          yaml: lms.yaml,
        },
        progress,
      )

      output.appendWithNewline(result.message)
      if (result.details) {
        output.appendWithNewline(result.details)
      }
    } catch (error: unknown) {
      const { message, details } = formatError(error)
      output.appendWithNewline(`⚠ Error: ${message}`)
      if (details) {
        output.appendWithNewline(details)
      }
    }
  }

  return { verifyCourse, verifyAllCourses, handleGenerateFiles }
}
