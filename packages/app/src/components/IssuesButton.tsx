import { Button } from "@repo-edu/ui";
import { useIssues } from "../hooks/use-issues.js";
import { useUiStore } from "../stores/ui-store.js";

export function IssuesButton() {
  const { issueCards } = useIssues();
  const setIssuesSheetOpen = useUiStore((s) => s.setIssuesSheetOpen);

  const count = issueCards.length;
  if (count === 0) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setIssuesSheetOpen(true)}
    >
      {count} issue{count !== 1 ? "s" : ""}
    </Button>
  );
}
