import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from "@repo-edu/ui";
import { Folder, Loader2 } from "@repo-edu/ui/components/icons";
import { useMemo, useState } from "react";
import { getRendererHost } from "../../contexts/renderer-host.js";
import { getWorkflowClient } from "../../contexts/workflow-client.js";
import { useProfileStore } from "../../stores/profile-store.js";
import { useToastStore } from "../../stores/toast-store.js";
import { useUiStore } from "../../stores/ui-store.js";
import { getErrorMessage } from "../../utils/error-message.js";

function countUsernameChanges(previous: ReturnType<typeof toUsernameMap>, next: ReturnType<typeof toUsernameMap>): number {
  let changed = 0;
  for (const [id, username] of next.entries()) {
    if ((previous.get(id) ?? null) !== username) {
      changed += 1;
    }
  }
  return changed;
}

function toUsernameMap(students: Array<{ id: string; gitUsername: string | null }>) {
  return new Map(students.map((student) => [student.id, student.gitUsername]));
}

export function ImportGitUsernamesDialog() {
  const open = useUiStore((state) => state.importGitUsernamesDialogOpen);
  const setOpen = useUiStore((state) => state.setImportGitUsernamesDialogOpen);
  const profile = useProfileStore((state) => state.profile);
  const setRoster = useProfileStore((state) => state.setRoster);
  const addToast = useToastStore((state) => state.addToast);

  const [fileName, setFileName] = useState("");
  const [fileRef, setFileRef] = useState<{
    kind: "user-file-ref";
    referenceId: string;
    displayName: string;
    mediaType: string | null;
    byteLength: number | null;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasStudents = (profile?.roster.students.length ?? 0) > 0;

  const handleBrowse = async () => {
    try {
      const host = getRendererHost();
      const file = await host.pickUserFile({
        title: "Select Git username CSV",
        acceptFormats: ["csv"],
      });
      if (!file) return;
      setFileRef(file);
      setFileName(file.displayName);
      setError(null);
    } catch (cause) {
      const message = getErrorMessage(cause);
      setError(message);
    }
  };

  const handleImport = async () => {
    if (!fileRef || !profile) return;

    setImporting(true);
    setError(null);

    const previous = toUsernameMap(profile.roster.students);

    try {
      const client = getWorkflowClient();
      const importedRoster = await client.run("gitUsernames.import", {
        file: fileRef,
      });
      setRoster(importedRoster, "Import git usernames");
      const changed = countUsernameChanges(
        previous,
        toUsernameMap(importedRoster.students),
      );
      addToast(
        changed > 0
          ? `Imported ${changed} Git username${changed === 1 ? "" : "s"}`
          : "Git username import applied",
        { tone: "success" },
      );
      handleClose();
    } catch (cause) {
      const message = getErrorMessage(cause);
      setError(message);
      addToast(`Git username import failed: ${message}`, { tone: "error" });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setFileName("");
    setFileRef(null);
    setError(null);
    setImporting(false);
  };

  const canImport = fileRef !== null && !importing && hasStudents;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Git Usernames</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-3">
          {!hasStudents ? (
            <Text className="text-sm text-muted-foreground">
              Import students first before importing Git usernames.
            </Text>
          ) : (
            <>
              <Text className="text-sm text-muted-foreground">
                Import a CSV with `email` and `git_username` columns. Matching
                is performed by email.
              </Text>
              <div className="flex gap-2">
                <Input
                  value={fileName}
                  placeholder="Select CSV file..."
                  readOnly
                  className="flex-1"
                />
                <Button variant="outline" onClick={() => void handleBrowse()}>
                  <Folder className="size-4 mr-1" />
                  Browse
                </Button>
              </div>
            </>
          )}

          {error && <Text className="text-sm text-destructive">{error}</Text>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleImport()} disabled={!canImport}>
            {importing ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" />
                Importing...
              </>
            ) : (
              "Import"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
