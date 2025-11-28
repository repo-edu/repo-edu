import { Textarea } from "@repo-edu/ui";
import { useOutputStore } from "../stores";

export function OutputConsole() {
  const text = useOutputStore((s) => s.text);

  return (
    <div className="flex-1 min-h-32">
      <Textarea
        size="xs"
        value={text}
        readOnly
        className="h-full font-mono resize-none console-output"
        placeholder="Output will appear here..."
      />
    </div>
  );
}
