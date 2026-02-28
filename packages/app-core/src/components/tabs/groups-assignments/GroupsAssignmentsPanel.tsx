import { EmptyState, Text } from "@repo-edu/ui"
import { useEffect } from "react"
import {
  selectGroupSetById,
  useProfileStore,
} from "../../../stores/profileStore"
import type { SidebarSelection } from "../../../stores/uiStore"
import { useUiStore } from "../../../stores/uiStore"
import { GroupSetPanel } from "./GroupSetPanel"

interface GroupsAssignmentsPanelProps {
  selection: SidebarSelection
}

export function GroupsAssignmentsPanel({
  selection,
}: GroupsAssignmentsPanelProps) {
  const selectedGroupSet = useProfileStore(
    selectGroupSetById(selection?.id ?? ""),
  )
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)

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
