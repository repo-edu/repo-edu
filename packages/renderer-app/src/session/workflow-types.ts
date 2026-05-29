import type { WorkflowId } from "@repo-edu/application-contract"

export type ControllerWorkflowId =
  | "settings.loadApp"
  | "settings.saveApp"
  | "course.load"
  | "course.save"
  | "course.delete"

export type AppWorkflowId = Exclude<WorkflowId, ControllerWorkflowId>
