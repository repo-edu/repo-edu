import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui";
import { useProfiles } from "../hooks/use-profiles.js";
import { useUiStore } from "../stores/ui-store.js";

export function ProfileSwitcher() {
  const { profiles, loading, refresh, switchProfile } = useProfiles();
  const activeProfileId = useUiStore((s) => s.activeProfileId);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Select
      value={activeProfileId ?? ""}
      onValueChange={(value) => void switchProfile(value)}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder={loading ? "Loading..." : "Select profile"} />
      </SelectTrigger>
      <SelectContent>
        {profiles.map((profile) => (
          <SelectItem key={profile.id} value={profile.id}>
            {profile.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
