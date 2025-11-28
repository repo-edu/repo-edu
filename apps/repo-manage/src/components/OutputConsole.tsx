import { useEffect, useRef, useState } from "react";
import { Button, Textarea, cn } from "@repo-edu/ui";
import { useOutputStore } from "../stores";

interface OutputConsoleProps {
  className?: string;
}

export function OutputConsole({ className }: OutputConsoleProps) {
  const text = useOutputStore((s) => s.text);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    if (atBottom && textareaRef.current) {
      const el = textareaRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [text, atBottom]);

  const handleScroll = () => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    setAtBottom(nearBottom);
  };

  const scrollToBottom = () => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
      setAtBottom(true);
    }
  };

  return (
    <div className={cn("relative flex-1 min-h-0 flex flex-col", className)}>
      <Textarea
        ref={textareaRef}
        size="xs"
        value={text}
        readOnly
        onScroll={handleScroll}
        className="font-mono console-output console-panel flex-1"
        placeholder="Output will appear here..."
      />
      {!atBottom && (
        <Button
          size="xs"
          variant="outline"
          className="absolute bottom-2 right-2"
          onClick={scrollToBottom}
        >
          Jump to bottom
        </Button>
      )}
    </div>
  );
}
