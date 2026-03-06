/**
 * NoProfileEmptyState — Shown in tab content when no profile is active.
 * Distinguishes between "no profiles exist" and "profiles exist, none selected"
 * and provides contextual actions.
 */

import { Button, EmptyState } from "@repo-edu/ui";
import { Link } from "@repo-edu/ui/components/icons";
import {
  useAppSettingsStore,
  selectLmsConnections,
} from "../stores/app-settings-store.js";
import { useUiStore } from "../stores/ui-store.js";

type NoProfileEmptyStateProps = {
  /** Tab-specific noun shown in the "Select a profile to view {tabLabel}." message. */
  tabLabel: string;
};

export function NoProfileEmptyState({ tabLabel }: NoProfileEmptyStateProps) {
  const profiles = useUiStore((s) => s.profileList);
  const setNewProfileDialogOpen = useUiStore(
    (s) => s.setNewProfileDialogOpen,
  );
  const openSettings = useUiStore((s) => s.openSettings);
  const lmsConnections = useAppSettingsStore(selectLmsConnections);

  const hasProfiles = profiles.length > 0;
  const hasLmsConnection = lmsConnections.length > 0;

  if (hasProfiles) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState message={`Select a profile to view ${tabLabel}.`} />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <EmptyState
        message={
          hasLmsConnection
            ? "Create a profile to get started."
            : "Set up an LMS connection to import courses, or create a profile manually."
        }
      >
        {!hasLmsConnection && (
          <Button onClick={() => openSettings("connections")}>
            <Link className="size-4 mr-1" />
            Set Up LMS
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => setNewProfileDialogOpen(true)}
        >
          Create Profile
        </Button>
      </EmptyState>
    </div>
  );
}
