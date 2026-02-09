import { EmptyState, Text } from "@repo-edu/ui"
import type { SidebarSelection } from "../../../stores/uiStore"
import { AssignmentPanel } from "./AssignmentPanel"
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
          Choose a group set or assignment to view details.
        </Text>
      </EmptyState>
    )
  }

  if (selection.kind === "group-set") {
    return <GroupSetPanel key={selection.id} groupSetId={selection.id} />
  }

  if (selection.kind === "assignment") {
    return <AssignmentPanel key={selection.id} assignmentId={selection.id} />
  }

  return null
}
