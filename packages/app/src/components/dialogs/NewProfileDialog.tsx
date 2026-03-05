import type { PersistedProfile, Roster } from "@repo-edu/domain";
import { persistedProfileKind } from "@repo-edu/domain";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui";
import { useMemo, useState } from "react";
import { getWorkflowClient } from "../../contexts/workflow-client.js";
import { useAppSettingsStore } from "../../stores/app-settings-store.js";
import { useToastStore } from "../../stores/toast-store.js";
import { useUiStore } from "../../stores/ui-store.js";
import { generateProfileId } from "../../utils/nanoid.js";

const EMPTY_ROSTER: Roster = {
  connection: null,
  students: [],
  staff: [],
  groups: [],
  groupSets: [],
  assignments: [],
};
const NONE_VALUE = "__none__";

export function NewProfileDialog() {
  const open = useUiStore((state) => state.newProfileDialogOpen);
  const setOpen = useUiStore((state) => state.setNewProfileDialogOpen);
  const setActiveProfileId = useUiStore((state) => state.setActiveProfileId);
  const setProfileList = useUiStore((state) => state.setProfileList);
  const setRosterSyncDialogOpen = useUiStore(
    (state) => state.setRosterSyncDialogOpen,
  );
  const addToast = useToastStore((state) => state.addToast);

  const settings = useAppSettingsStore((state) => state.settings);
  const saveAppSettings = useAppSettingsStore((state) => state.save);
  const setSettingsActiveProfileId = useAppSettingsStore(
    (state) => state.setActiveProfileId,
  );

  const [profileName, setProfileName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [selectedLmsConnection, setSelectedLmsConnection] =
    useState<string>("");
  const [selectedGitConnection, setSelectedGitConnection] =
    useState<string>("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lmsConnections = settings.lmsConnections;
  const gitConnections = settings.gitConnections;

  const canCreate = useMemo(
    () => profileName.trim().length > 0 && !creating,
    [profileName, creating],
  );

  const reset = () => {
    setProfileName("");
    setCourseId("");
    setSelectedLmsConnection("");
    setSelectedGitConnection("");
    setCreating(false);
    setError(null);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const handleCreate = async () => {
    if (!canCreate) return;

    setCreating(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      const profile: PersistedProfile = {
        kind: persistedProfileKind,
        schemaVersion: 2,
        id: generateProfileId(),
        displayName: profileName.trim(),
        lmsConnectionName: selectedLmsConnection || null,
        gitConnectionName: selectedGitConnection || null,
        courseId: courseId.trim() || null,
        roster: EMPTY_ROSTER,
        repositoryTemplate: null,
        updatedAt: now,
      };

      const client = getWorkflowClient();
      const saved = await client.run("profile.save", profile);
      const profiles = await client.run("profile.list", undefined);
      setProfileList(profiles);
      setActiveProfileId(saved.id);

      setSettingsActiveProfileId(saved.id);
      await saveAppSettings();

      addToast(`Created profile "${saved.displayName}"`, {
        tone: "success",
      });
      handleClose();

      if (
        saved.lmsConnectionName !== null &&
        (saved.courseId ?? "").trim().length > 0
      ) {
        setRosterSyncDialogOpen(true);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      addToast(`Create profile failed: ${message}`, { tone: "error" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Profile</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <FormField label="Profile name" htmlFor="new-profile-name">
            <Input
              id="new-profile-name"
              placeholder="e.g., Software Engineering 2026"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canCreate) {
                  void handleCreate();
                }
              }}
              autoFocus
            />
          </FormField>

          <FormField
            label="LMS connection (optional)"
            htmlFor="new-profile-lms-connection"
          >
            <Select
              value={selectedLmsConnection || NONE_VALUE}
              onValueChange={(value) =>
                setSelectedLmsConnection(value === NONE_VALUE ? "" : value)
              }
            >
              <SelectTrigger id="new-profile-lms-connection">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None</SelectItem>
                {lmsConnections.map((connection) => (
                  <SelectItem key={connection.name} value={connection.name}>
                    {connection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Course ID (optional)" htmlFor="new-profile-course-id">
            <Input
              id="new-profile-course-id"
              placeholder="e.g., SE-2026-A"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            />
          </FormField>

          <FormField
            label="Git connection (optional)"
            htmlFor="new-profile-git-connection"
          >
            <Select
              value={selectedGitConnection || NONE_VALUE}
              onValueChange={(value) =>
                setSelectedGitConnection(value === NONE_VALUE ? "" : value)
              }
            >
              <SelectTrigger id="new-profile-git-connection">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None</SelectItem>
                {gitConnections.map((connection) => (
                  <SelectItem key={connection.name} value={connection.name}>
                    {connection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {error && <Text className="text-sm text-destructive">{error}</Text>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!canCreate}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
