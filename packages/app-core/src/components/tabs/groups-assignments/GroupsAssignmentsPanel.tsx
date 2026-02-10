import { EmptyState, Text } from "@repo-edu/ui"
import type { SidebarSelection } from "../../../stores/uiStore"
import { GroupSetPanel } from "./GroupSetPanel"

interface GroupsAssignmentsPanelProps {
  selection: SidebarSelection
}

export function GroupsAssignmentsPanel({
  selection,
}: GroupsAssignmentsPanelProps) {
  if (!selection) {
    return (
      <EmptyState message="Select an item from the sidebar">
        <Text className="text-muted-foreground text-center">
          Choose a group set to view details.
        </Text>
      </EmptyState>
    )
  }

  return <GroupSetPanel key={selection.id} groupSetId={selection.id} />
}
