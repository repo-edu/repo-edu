import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Text,
} from "@repo-edu/ui";
import { Upload } from "@repo-edu/ui/components/icons";
import { useEffect, useMemo, useState } from "react";
import { getRendererHost } from "../../contexts/renderer-host.js";
import { getWorkflowClient } from "../../contexts/workflow-client.js";
import { useProfileStore } from "../../stores/profile-store.js";
import { useToastStore } from "../../stores/toast-store.js";
import { useUiStore } from "../../stores/ui-store.js";

const NONE_VALUE = "__none__";

export function FileImportExportSheet() {
  const fileImportExportOpen = useUiStore((state) => state.fileImportExportOpen);
  const setFileImportExportOpen = useUiStore(
    (state) => state.setFileImportExportOpen,
  );
  const exportGroupSetTriggerId = useUiStore(
    (state) => state.exportGroupSetTriggerId,
  );
  const setExportGroupSetTriggerId = useUiStore(
    (state) => state.setExportGroupSetTriggerId,
  );
  const setImportGroupSetDialogOpen = useUiStore(
    (state) => state.setImportGroupSetDialogOpen,
  );
  const setReimportGroupSetTargetId = useUiStore(
    (state) => state.setReimportGroupSetTargetId,
  );
  const selection = useUiStore((state) => state.sidebarSelection);
  const activeProfileId = useUiStore((state) => state.activeProfileId);

  const roster = useProfileStore((state) => state.profile?.roster ?? null);
  const addToast = useToastStore((state) => state.addToast);

  const [selectedGroupSetId, setSelectedGroupSetId] = useState<string>("");
  const [exportingFormat, setExportingFormat] = useState<
    "csv" | "xlsx" | "yaml" | null
  >(null);

  const open = fileImportExportOpen || exportGroupSetTriggerId !== null;

  const groupSets = useMemo(
    () =>
      (roster?.groupSets ?? []).filter(
        (groupSet) => groupSet.connection?.kind !== "system",
      ),
    [roster],
  );

  const selectedGroupSet = useMemo(
    () =>
      groupSets.find((groupSet) => groupSet.id === selectedGroupSetId) ?? null,
    [groupSets, selectedGroupSetId],
  );

  useEffect(() => {
    if (!open) {
      setSelectedGroupSetId("");
      return;
    }

    const preferredId =
      exportGroupSetTriggerId ??
      (selection?.kind === "group-set" ? selection.id : null) ??
      groupSets[0]?.id ??
      "";
    setSelectedGroupSetId(preferredId);
  }, [open, exportGroupSetTriggerId, selection, groupSets]);

  const handleClose = () => {
    setFileImportExportOpen(false);
    setExportGroupSetTriggerId(null);
    setExportingFormat(null);
  };

  const handleExport = async (format: "csv" | "xlsx" | "yaml") => {
    if (!activeProfileId || !selectedGroupSetId) return;

    setExportingFormat(format);
    try {
      const host = getRendererHost();
      const suggestedName = `${selectedGroupSet?.name ?? "group-set"}.${format}`;
      const target = await host.pickSaveTarget({
        title: `Export group set as ${format.toUpperCase()}`,
        suggestedName,
        defaultFormat: format,
      });
      if (!target) return;

      const client = getWorkflowClient();
      await client.run("groupSet.export", {
        profileId: activeProfileId,
        groupSetId: selectedGroupSetId,
        target,
        format,
      });

      addToast(
        `Exported "${selectedGroupSet?.name ?? "group set"}" as ${format.toUpperCase()}`,
        { tone: "success" },
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      addToast(`Export failed: ${message}`, { tone: "error" });
    } finally {
      setExportingFormat(null);
    }
  };

  const handleImportNew = () => {
    setImportGroupSetDialogOpen(true);
    handleClose();
  };

  const handleReimport = () => {
    if (!selectedGroupSetId) return;
    setReimportGroupSetTargetId(selectedGroupSetId);
    handleClose();
  };

  const canReimport = selectedGroupSet?.connection?.kind === "import";

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        } else {
          setFileImportExportOpen(true);
        }
      }}
    >
      <SheetContent className="w-full sm:max-w-lg flex flex-col bg-background">
        <SheetHeader>
          <SheetTitle>File Import / Export</SheetTitle>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-6 py-4 overflow-y-auto">
          <section className="space-y-2">
            <h4 className="font-medium">Group Set</h4>
            {groupSets.length === 0 ? (
              <Text className="text-sm text-muted-foreground">
                No group sets available yet.
              </Text>
            ) : (
              <Select
                value={selectedGroupSetId || NONE_VALUE}
                onValueChange={(value) =>
                  setSelectedGroupSetId(value === NONE_VALUE ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a group set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE} disabled>
                    Select a group set
                  </SelectItem>
                  {groupSets.map((groupSet) => (
                    <SelectItem key={groupSet.id} value={groupSet.id}>
                      {groupSet.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="font-medium">Export</h4>
            <Text className="text-sm text-muted-foreground">
              Export the selected group set for editing or repository tooling.
            </Text>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void handleExport("csv")}
                disabled={!selectedGroupSetId || exportingFormat !== null}
              >
                {exportingFormat === "csv" ? "Exporting..." : "CSV"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleExport("xlsx")}
                disabled={!selectedGroupSetId || exportingFormat !== null}
              >
                {exportingFormat === "xlsx" ? "Exporting..." : "XLSX"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleExport("yaml")}
                disabled={!selectedGroupSetId || exportingFormat !== null}
              >
                {exportingFormat === "yaml" ? "Exporting..." : "YAML"}
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="font-medium">Import</h4>
            <Text className="text-sm text-muted-foreground">
              Import a new group set from file or re-import into an existing
              imported set.
            </Text>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleImportNew}>
                <Upload className="size-4 mr-1.5" />
                Import New Group Set
              </Button>
              <Button
                variant="outline"
                onClick={handleReimport}
                disabled={!selectedGroupSetId || !canReimport}
              >
                Reimport Selected
              </Button>
            </div>
            {!canReimport && selectedGroupSetId && (
              <Text className="text-xs text-muted-foreground">
                Reimport is available only for group sets originally imported
                from file.
              </Text>
            )}
          </section>
        </div>

        <SheetFooter className="border-t pt-4">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
