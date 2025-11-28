import { Button, Input } from "@repo-edu/ui";

interface FilePathInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onBrowse: () => void;
  browseLabel?: string;
}

export function FilePathInput({
  value,
  onChange,
  placeholder,
  onBrowse,
  browseLabel = "Browse",
}: FilePathInputProps) {
  return (
    <div className="flex gap-1 flex-1">
      <Input
        size="xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1"
      />
      <Button size="xs" variant="outline" onClick={onBrowse}>
        {browseLabel}
      </Button>
    </div>
  );
}
