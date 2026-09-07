import type { WorkflowId } from "@repo-edu/application-contract"

export type ControllerWorkflowId =
  | "course.list"
  | "settings.loadApp"
  | "settings.saveCredentials"
  | "settings.savePreferences"
  | "course.load"
  | "course.save"
  | "course.delete"

export type AppWorkflowId = Exclude<WorkflowId, ControllerWorkflowId>
