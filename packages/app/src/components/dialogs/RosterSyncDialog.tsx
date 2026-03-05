import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@repo-edu/ui";
import { AlertTriangle, Loader2 } from "@repo-edu/ui/components/icons";
import { useEffect, useRef, useState } from "react";
import type { Roster } from "@repo-edu/domain";
import { getWorkflowClient } from "../../contexts/workflow-client.js";
import { useProfileStore } from "../../stores/profile-store.js";
import { useToastStore } from "../../stores/toast-store.js";
import { useUiStore } from "../../stores/ui-store.js";

export function RosterSyncDialog() {
  const open = useUiStore((state) => state.rosterSyncDialogOpen);
  const setOpen = useUiStore((state) => state.setRosterSyncDialogOpen);
  const activeProfileId = useUiStore((state) => state.activeProfileId);
  const courseId = useProfileStore((state) => state.profile?.courseId ?? null);

  const setRoster = useProfileStore((state) => state.setRoster);
  const addToast = useToastStore((state) => state.addToast);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<Roster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const hasAutoPreviewedRef = useRef(false);
  const previewRequestIdRef = useRef(0);

  const resetState = () => {
    previewRequestIdRef.current += 1;
    setLoadingPreview(false);
    setPreview(null);
    setError(null);
    setProgressMessage(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  };

  const handlePreview = async () => {
    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;

    if (!activeProfileId || !courseId) {
      setError("LMS connection or course is not configured");
      setProgressMessage(null);
      return;
    }

    setLoadingPreview(true);
    setError(null);
    setPreview(null);
    setProgressMessage("Connecting to LMS...");

    try {
      const client = getWorkflowClient();
      const result = await client.run(
        "roster.importFromLms",
        { profileId: activeProfileId, courseId },
        {
          onProgress: (p) => {
            if (previewRequestIdRef.current !== requestId) return;
            setProgressMessage(p.label);
          },
        },
      );
      if (previewRequestIdRef.current !== requestId) return;
      setPreview(result);
      setProgressMessage(null);
    } catch (previewError) {
      if (previewRequestIdRef.current !== requestId) return;
      const message =
        previewError instanceof Error
          ? previewError.message
          : String(previewError);
      setError(message);
      setProgressMessage(null);
    } finally {
      if (previewRequestIdRef.current === requestId) {
        setLoadingPreview(false);
      }
    }
  };

  useEffect(() => {
    if (!open) {
      hasAutoPreviewedRef.current = false;
      return;
    }
    if (hasAutoPreviewedRef.current) return;
    hasAutoPreviewedRef.current = true;
    void handlePreview();
  }, [open]);

  const handleApply = () => {
    if (!preview) return;
    setRoster(preview, "Sync roster from LMS");
    addToast(
      `Imported ${preview.students.length} students, ${preview.staff.length} staff`,
      { tone: "success" },
    );
    setOpen(false);
    resetState();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync Roster from LMS</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <Text className="text-sm text-muted-foreground">
            Sync imports all enrollment types from LMS and updates both students
            and staff.
          </Text>

          {loadingPreview && (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {progressMessage ?? "Fetching roster preview..."}
            </div>
          )}

          {error && (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle className="size-4" />
                <span>{error}</span>
              </div>
              {!loadingPreview && (
                <Button variant="outline" onClick={handlePreview}>
                  Retry Preview
                </Button>
              )}
            </div>
          )}

          {preview && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">
                Preview: {preview.students.length} students,{" "}
                {preview.staff.length} staff
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!preview || loadingPreview}>
            Apply Sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
