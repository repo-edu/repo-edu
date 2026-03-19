import type { UserFilePort } from "@repo-edu/host-runtime-contract"
import type { LmsClient } from "@repo-edu/integrations-lms-contract"

export type GroupSetWorkflowPorts = {
  lms: Pick<LmsClient, "listGroupSets" | "fetchGroupSet">
  userFile: UserFilePort
}
