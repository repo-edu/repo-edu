import { EmptyState } from "@repo-edu/ui"
import { Layers } from "@repo-edu/ui/components/icons"
import { useEffect } from "react"
import {
  selectGroupSetById,
  useCourseStore,
} from "../../../stores/course-store.js"
import { useUiStore } from "../../../stores/ui-store.js"
import { GroupSetPanel } from "./GroupSetPanel.js"

type SidebarSelection = { kind: "group-set"; id: string } | null

type GroupsAssignmentsPanelProps = {
  selection: SidebarSelection
}

export function GroupsAssignmentsPanel({
  selection,
}: GroupsAssignmentsPanelProps) {
  const selectedGroupSet = useCourseStore(
    selectGroupSetById(selection?.id ?? ""),
  )
  const setSidebarSelection = useUiStore((s) => s.setSidebarSelection)

  // Clear stale selection if the group set was deleted.
  useEffect(() => {
    if (selection && !selectedGroupSet) {
      setSidebarSelection(null)
    }
  }, [selection, selectedGroupSet, setSidebarSelection])

  if (!selection || !selectedGroupSet) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <EmptyState
          className="[&>p]:text-foreground [&>p]:text-lg [&>p]:font-medium [&>p]:leading-tight"
          icon={<Layers className="text-muted-foreground/50 size-10" />}
          message="Select a group set to view its groups."
        />
      </div>
    )
  }

  return <GroupSetPanel key={selection.id} groupSetId={selection.id} />
}
