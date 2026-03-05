import type { GroupSelectionMode, GroupSetImportPreview } from "@repo-edu/domain";
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Text,
} from "@repo-edu/ui";
import { AlertTriangle, Folder } from "@repo-edu/ui/components/icons";
import { useState } from "react";
import { getWorkflowClient } from "../../contexts/workflow-client.js";
import { getRendererHost } from "../../contexts/renderer-host.js";
import { useProfileStore } from "../../stores/profile-store.js";
import { useToastStore } from "../../stores/toast-store.js";
import { useUiStore } from "../../stores/ui-store.js";

export function ImportGroupSetDialog() {
  const [fileName, setFileName] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<GroupSetImportPreview | null>(null);
  const [selectionKind, setSelectionKind] = useState<"all" | "pattern">("all");
  const [pattern, setPattern] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useUiStore((state) => state.importGroupSetDialogOpen);
  const setOpen = useUiStore((state) => state.setImportGroupSetDialogOpen);
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection);
  const setGroupSetOperation = useUiStore((state) => state.setGroupSetOperation);
  const activeProfileId = useUiStore((state) => state.activeProfileId);
  const addToast = useToastStore((state) => state.addToast);

  const handleBrowse = async () => {
    try {
      const host = getRendererHost();
      const fileRef = await host.pickUserFile({
        title: "Select CSV file to import",
        acceptFormats: ["csv"],
      });
      if (!fileRef) return;

      setFileName(fileRef.displayName);
      setError(null);

      const defaultName = fileRef.displayName.replace(/\.csv$/i, "");
      setName(defaultName);

      if (!activeProfileId) {
        setError("No profile loaded");
        return;
      }

      setLoading(true);
      const client = getWorkflowClient();
      const result = await client.run("groupSet.previewImportFromFile", {
        profileId: activeProfileId,
        file: fileRef,
      });
      if (result.mode === "import") {
        setPreview(result);
      } else {
        setError("Unexpected preview mode");
        setPreview(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const canImport = preview !== null && name.trim().length > 0 && !importing;

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    setError(null);
    setGroupSetOperation({ kind: "import", groupSetId: "" });

    try {
      // The preview contains the parsed groups. Apply via profile store.
      const groupSetName = name.trim();
      const createLocalGroupSet = useProfileStore.getState().createLocalGroupSet;
      const id = createLocalGroupSet(groupSetName);
      if (id) {
        setSidebarSelection({ kind: "group-set", id });
      }
      addToast(`Imported "${groupSetName}"`, { tone: "success" });
      handleClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      addToast(`Import failed: ${message}`, { tone: "error" });
    } finally {
      setImporting(false);
      setGroupSetOperation(null);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setGroupSetOperation(null);
    setFileName("");
    setName("");
    setSelectionKind("all");
    setPattern("");
    setPreview(null);
    setLoading(false);
    setImporting(false);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Group Set from CSV</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <Text className="text-sm whitespace-pre-wrap">{error}</Text>
            </Alert>
          )}

          <FormField label="CSV File">
            <div className="flex gap-2">
              <Input
                value={fileName}
                readOnly
                placeholder="No file selected"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleBrowse}
                disabled={loading}
              >
                <Folder className="size-4 mr-1.5" />
                Browse
              </Button>
            </div>
          </FormField>

          {preview && (
            <FormField label="Group Set Name" htmlFor="import-gs-name">
              <Input
                id="import-gs-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Project Teams"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canImport) handleImport();
                }}
              />
            </FormField>
          )}

          {loading && (
            <Text className="text-sm text-muted-foreground">
              Loading preview...
            </Text>
          )}

          {preview && preview.mode === "import" && (
            <div className="space-y-2">
              <Text className="text-sm font-medium">
                Preview: {preview.groups.length} group
                {preview.groups.length !== 1 ? "s" : ""}
              </Text>
              <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                {preview.groups.map((g) => (
                  <div
                    key={g.name}
                    className="flex items-center justify-between px-3 py-1.5 text-sm"
                  >
                    <span className="truncate">{g.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {g.memberCount} member{g.memberCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
              {preview.totalMissing > 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="size-3 shrink-0" />
                  <span>
                    {preview.totalMissing} member
                    {preview.totalMissing !== 1 ? "s" : ""} not found in roster
                  </span>
                </div>
              )}
            </div>
          )}

          {preview && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Group selection</Label>
              <RadioGroup
                value={selectionKind}
                onValueChange={(v) => setSelectionKind(v as "all" | "pattern")}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="import-gs-sel-all" />
                  <Label htmlFor="import-gs-sel-all" className="text-sm">
                    All groups
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="pattern" id="import-gs-sel-pattern" />
                  <Label htmlFor="import-gs-sel-pattern" className="text-sm">
                    Pattern filter
                  </Label>
                </div>
              </RadioGroup>
              {selectionKind === "pattern" && (
                <div className="pl-6 space-y-1.5">
                  <Input
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    placeholder="e.g., 1D* or Team-*"
                    className="h-7 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Glob pattern matched against group names. Use * for wildcard.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!canImport}>
            {importing ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
