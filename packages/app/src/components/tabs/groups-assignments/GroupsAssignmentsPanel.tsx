import { EmptyState, Text } from "@repo-edu/ui"
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

  if (!selection) {
    return (
      <EmptyState message="Select an item from the sidebar">
        <Text className="text-muted-foreground text-center">
          Choose a group set to view details.
        </Text>
      </EmptyState>
    )
  }

  if (!selectedGroupSet) {
    return (
      <EmptyState message="Group set not found">
        <Text className="text-muted-foreground text-center">
          The selected group set no longer exists.
        </Text>
      </EmptyState>
    )
  }

  return <GroupSetPanel key={selection.id} groupSetId={selection.id} />
}
