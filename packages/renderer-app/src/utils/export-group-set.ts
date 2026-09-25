import type { GroupSet, PersistedCourse } from "@repo-edu/domain/types"
import { getRendererHost } from "../contexts/renderer-host.js"
import { getWorkflowClient } from "../contexts/workflow-client.js"
import type { SessionStart } from "../session/session-start.js"

/**
 * Directly exports a group set to file by opening a save dialog
 * and running the export workflow. Format is determined by `nameMode`:
 * named → CSV, unnamed → TXT.
 */
export async function exportGroupSet(
  start: SessionStart,
  course: PersistedCourse,
  groupSet: GroupSet,
): Promise<void> {
  const format = groupSet.nameMode === "named" ? "csv" : "txt"
  const suggestedName = `${groupSet.name}.${format}`

  const client = getWorkflowClient()
  await client.execute(start, "groupSet.export", async (scope) => {
    const host = getRendererHost()
    const target = await scope.direct("pickSaveTarget", () =>
      host.pickSaveTarget({
        title: `Export ${groupSet.nameMode === "named" ? "named groups" : "unnamed teams"} (${format.toUpperCase()})`,
        suggestedName,
        defaultFormat: format,
      }),
    )
    if (!target) return

    await scope.run("groupSet.export", {
      course,
      groupSetId: groupSet.id,
      target,
      format,
    })
  })
}
