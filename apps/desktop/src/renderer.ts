import type { AppError } from "@repo-edu/application-contract"
import { AppRoot } from "@repo-edu/renderer-app"
import React from "react"
import { createRoot } from "react-dom/client"
import "../../../packages/renderer-app/src/App.css"
import { desktopSeedCourseId } from "./course-ids"
import { createRendererHostFromBridge } from "./renderer-host-bridge"
import { UpdateDialog } from "./UpdateDialog"
import { createDesktopWorkflowClient } from "./workflow-client"

const trpcMarker = "repo-edu-desktop-trpc"
const searchParams = new URLSearchParams(window.location.search)
const isTRPCValidationMode = searchParams.get("mode") === "validate-trpc"
const validationCourseId =
  searchParams.get("courseId")?.trim() || desktopSeedCourseId

const mountNode = document.querySelector<HTMLDivElement>("#app")
if (!mountNode) {
  throw new Error("Renderer mount node #app was not found")
}

document.documentElement.classList.add("repo-edu-shell-html")
document.body.classList.add("repo-edu-shell-body")

if (!window.repoEduDesktopHost) {
  throw new Error("Desktop renderer host bridge was not exposed from preload.")
}

const workflowClient = createDesktopWorkflowClient()
const rendererHost = createRendererHostFromBridge(window.repoEduDesktopHost)

function ensureValidationOutputNode(): HTMLOutputElement {
  let markerNode = document.querySelector<HTMLOutputElement>(
    "#repo-edu-trpc-marker",
  )

  if (markerNode) {
    return markerNode
  }

  markerNode = document.createElement("output")
  markerNode.id = "repo-edu-trpc-marker"
  markerNode.hidden = true
  document.body.append(markerNode)
  return markerNode
}

function emitValidationMarker(payload: Record<string, unknown>) {
  const markerNode = ensureValidationOutputNode()
  markerNode.value = JSON.stringify(payload)
  markerNode.textContent = markerNode.value
}

function normalizeAppError(error: unknown): AppError {
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    "message" in error &&
    typeof error.type === "string" &&
    typeof error.message === "string"
  ) {
    return error as AppError
  }

  return {
    type: "unexpected",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  }
}

async function collectValidationSnapshot() {
  const environmentSnapshot = await rendererHost.getEnvironmentSnapshot()

  const courseList = await workflowClient.run("course.list", undefined)
  const loadedCourse = await workflowClient.run("course.load", {
    courseId: validationCourseId,
  })
  const savedCourse = await workflowClient.run("course.save", loadedCourse)

  const loadedSettings = await workflowClient.run("settings.loadApp", undefined)
  const savedSettings = await workflowClient.run(
    "settings.saveApp",
    loadedSettings,
  )

  const rosterValidation = await workflowClient.run("validation.roster", {
    course: loadedCourse,
  })
  const validationAssignmentId = loadedCourse.roster.assignments[0]?.id ?? null
  const assignmentValidation =
    validationAssignmentId === null
      ? { issues: [] }
      : await workflowClient.run("validation.assignment", {
          course: loadedCourse,
          assignmentId: validationAssignmentId,
        })

  return {
    environmentShell: environmentSnapshot.shell,
    environmentCanPromptForFiles: environmentSnapshot.canPromptForFiles,
    environmentWindowChrome: environmentSnapshot.windowChrome,
    courseCount: courseList.length,
    listedCourseIds: courseList.map((entry) => entry.id),
    loadedCourseId: loadedCourse.id,
    savedCourseId: savedCourse.id,
    savedCourseUpdatedAt: savedCourse.updatedAt,
    validationAssignmentId,
    settingsKind: loadedSettings.kind,
    settingsSchemaVersion: savedSettings.schemaVersion,
    rosterIssueKinds: rosterValidation.issues.map((issue) => issue.kind),
    assignmentIssueKinds: assignmentValidation.issues.map(
      (issue) => issue.kind,
    ),
  }
}

async function runValidationMode() {
  try {
    const snapshot = await collectValidationSnapshot()

    emitValidationMarker({
      marker: trpcMarker,
      validationCourseId,
      ...snapshot,
    })
  } catch (error) {
    const appError = normalizeAppError(error)

    emitValidationMarker({
      marker: trpcMarker,
      error: appError.message,
      errorType: appError.type,
    })

    throw error
  }
}

if (isTRPCValidationMode) {
  void runValidationMode()
} else {
  document.title = "Repo Edu"
  createRoot(mountNode).render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(AppRoot, { workflowClient, rendererHost }),
      React.createElement(UpdateDialog, {
        bridge: window.repoEduDesktopHost,
      }),
    ),
  )
}
