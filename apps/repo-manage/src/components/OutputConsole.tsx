import { useEffect, useRef, useState } from "react";
import { Button, Textarea, cn } from "@repo-edu/ui";
import { useOutputStore } from "../stores";

interface OutputConsoleProps {
  className?: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  hasSelection: boolean;
}

export function OutputConsole({ className }: OutputConsoleProps) {
  const text = useOutputStore((s) => s.text);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    if (atBottom && textareaRef.current) {
      const el = textareaRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [text, atBottom]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [contextMenu]);

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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const selection = window.getSelection()?.toString() || "";
    setContextMenu({ x: e.clientX, y: e.clientY, hasSelection: selection.length > 0 });
  };

  const handleCopy = () => {
    const selection = window.getSelection()?.toString();
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
    setContextMenu(null);
  };

  return (
    <div className={cn("relative flex-1 min-h-0 flex flex-col", className)}>
      <Textarea
        ref={textareaRef}
        size="xs"
        value={text}
        readOnly
        onScroll={handleScroll}
        onContextMenu={handleContextMenu}
        className="font-mono console-output console-panel flex-1"
        placeholder="Output will appear here..."
      />
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-md shadow-md py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleCopy}
            disabled={!contextMenu.hasSelection}
          >
            Copy
          </button>
        </div>
      )}
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
