import { Button } from "@repo-edu/ui";
import { useProfileStore } from "../stores/profile-store.js";

type UtilityBarProps = {
  isDirty: boolean;
  onSave: () => void;
};

export function UtilityBar({ isDirty, onSave }: UtilityBarProps) {
  const status = useProfileStore((s) => s.status);

  return (
    <div className="flex items-center justify-end gap-3 border-t px-4 py-2">
      {isDirty && (
        <span className="text-xs text-muted-foreground">Unsaved changes</span>
      )}
      <Button
        size="sm"
        disabled={!isDirty || status !== "loaded"}
        onClick={onSave}
      >
        Save
      </Button>
    </div>
  );
}
