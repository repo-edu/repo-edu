import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@repo-edu/ui";
import { useUiStore } from "../../stores/ui-store.js";

export function LmsImportConflictDialog() {
  const conflicts = useUiStore((state) => state.lmsImportConflicts);
  const setConflicts = useUiStore((state) => state.setLmsImportConflicts);

  const open = (conflicts?.length ?? 0) > 0;

  const handleClose = () => {
    setConflicts(null);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Roster Sync Conflicts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <Text className="text-sm text-muted-foreground">
            Conflicts are warnings only. Non-conflicting entries are applied and
            conflicting entries are left unchanged.
          </Text>
          <div className="max-h-64 overflow-auto space-y-3">
            {conflicts?.map((conflict) => (
              <div
                key={`${conflict.matchKey}:${conflict.value}`}
                className="rounded-md border p-3 text-sm space-y-2"
              >
                <Text className="font-medium">
                  {conflict.matchKey}: {conflict.value}
                </Text>
                <ul className="list-disc ml-5 space-y-0.5">
                  {conflict.matchedIds.map((id) => (
                    <li key={id}>
                      <code>{id}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
