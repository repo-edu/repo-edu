import { commands } from "../bindings/commands"
import { useAppSettingsStore } from "../stores/appSettingsStore"
import { useConnectionsStore } from "../stores/connectionsStore"
import { useOutputStore } from "../stores/outputStore"
import { useProfileSettingsStore } from "../stores/profileSettingsStore"
import { useRosterStore } from "../stores/rosterStore"
import type { LoadResult } from "../types/load"

export type ProfileLoadResult = {
  ok: boolean
  warnings: string[]
  error: string | null
  profileName: string
  stale: boolean
}

export type ProfileLoadOptions = {
  verifyCourse?: boolean
  resetCourseStatus?: boolean
  logWarnings?: boolean
  logErrors?: boolean
}

let loadSequence = 0

const toProfileLoadResult = (
  profileName: string,
  result: LoadResult,
  stale: boolean,
): ProfileLoadResult => ({
  ok: result.ok,
  warnings: result.warnings,
  error: result.error,
  profileName,
  stale,
})

export async function loadProfileData(
  profileName: string,
  options: ProfileLoadOptions = {},
): Promise<ProfileLoadResult> {
  const {
    verifyCourse = true,
    resetCourseStatus = true,
    logWarnings = true,
    logErrors = true,
  } = options

  const { load: loadProfileSettings, setCourse } =
    useProfileSettingsStore.getState()
  const { load: loadRoster } = useRosterStore.getState()
  const { lmsConnection } = useAppSettingsStore.getState()
  const { setCourseStatus, resetCourseStatus: resetCourseStatusStore } =
    useConnectionsStore.getState()
  const { appendText } = useOutputStore.getState()

  loadSequence += 1
  const loadId = loadSequence
  if (resetCourseStatus) {
    resetCourseStatusStore()
  }

  const [settingsResult, rosterResult] = await Promise.all([
    loadProfileSettings(profileName),
    loadRoster(profileName),
  ])

  if (loadId !== loadSequence) {
    return toProfileLoadResult(
      profileName,
      { ok: false, warnings: [], error: null },
      true,
    )
  }

  if (!settingsResult.ok || !rosterResult.ok) {
    const errors: string[] = []
    if (!settingsResult.ok && settingsResult.error) {
      errors.push(`settings: ${settingsResult.error}`)
    }
    if (!rosterResult.ok && rosterResult.error) {
      errors.push(`roster: ${rosterResult.error}`)
    }
    const error =
      errors.length > 0 ? errors.join("; ") : "Failed to load profile"

    if (!settingsResult.ok) {
      try {
        const defaults = await commands.getDefaultSettings()
        useProfileSettingsStore.getState().setFromSettings(defaults)
      } catch (defaultError) {
        const message =
          defaultError instanceof Error
            ? defaultError.message
            : String(defaultError)
        if (logErrors) {
          appendText(`✗ Failed to load default settings: ${message}`, "error")
        }
      }
    }

    if (!rosterResult.ok) {
      useRosterStore.getState().clear()
    }

    if (logErrors) {
      appendText(`✗ Failed to load profile '${profileName}': ${error}`, "error")
      appendText(
        `→ Using default settings for profile '${profileName}'.`,
        "warning",
      )
      appendText("→ Click Save to persist default settings.", "warning")
    }
    return toProfileLoadResult(
      profileName,
      { ok: false, warnings: settingsResult.warnings, error },
      false,
    )
  }

  if (logWarnings && settingsResult.warnings.length > 0) {
    for (const warning of settingsResult.warnings) {
      appendText(`⚠ ${warning}`, "warning")
    }
    appendText("→ Click Save to persist corrected settings.", "warning")
  }

  const isCurrentLoad = () => loadId === loadSequence

  if (verifyCourse && lmsConnection && isCurrentLoad()) {
    const course = useProfileSettingsStore.getState().course
    if (course.id.trim()) {
      setCourseStatus("verifying")
      try {
        const result = await commands.verifyProfileCourse(profileName)
        if (!isCurrentLoad()) {
          return toProfileLoadResult(
            profileName,
            { ok: true, warnings: settingsResult.warnings, error: null },
            true,
          )
        }
        if (result.status === "error") {
          setCourseStatus("failed", result.error.message)
        } else {
          const { success, message, updated_name } = result.data
          if (!success) {
            setCourseStatus("failed", message)
          } else {
            if (updated_name && updated_name !== course.name) {
              setCourse({ id: course.id, name: updated_name })
              appendText(`Course name updated: ${updated_name}`, "info")
            }
            setCourseStatus("verified")
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setCourseStatus("failed", message)
      }
    }
  }

  return toProfileLoadResult(
    profileName,
    { ok: true, warnings: settingsResult.warnings, error: null },
    false,
  )
}
