import { Button, cn, Textarea } from "@repo-edu/ui"
import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"
import { useOutputStore } from "../stores"

interface OutputConsoleProps {
  className?: string
  style?: CSSProperties
}

interface ContextMenuState {
  x: number
  y: number
  selectionLength: number
}

export function OutputConsole({ className, style }: OutputConsoleProps) {
  const text = useOutputStore((s) => s.text)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    if (atBottom && textareaRef.current) {
      const el = textareaRef.current
      el.scrollTop = el.scrollHeight
    }
  }, [text, atBottom])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    window.addEventListener("click", handleClick)
    return () => window.removeEventListener("click", handleClick)
  }, [contextMenu])

  const handleScroll = () => {
    if (!textareaRef.current) return
    const el = textareaRef.current
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8
    setAtBottom(nearBottom)
  }

  const scrollToBottom = () => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight
      setAtBottom(true)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const selLength =
      textareaRef.current?.selectionEnd && textareaRef.current?.selectionStart
        ? Math.abs(
            textareaRef.current.selectionEnd -
              textareaRef.current.selectionStart,
          )
        : 0
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      selectionLength: selLength,
    })
  }

  const handleCopy = () => {
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const hasSelection = end > start
      const textToCopy = hasSelection
        ? textarea.value.substring(start, end)
        : textarea.value
      navigator.clipboard.writeText(textToCopy)
    }
    setContextMenu(null)
  }

  return (
    <div
      className={cn("relative flex-1 min-h-0 flex flex-col", className)}
      style={style}
    >
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
          className="fixed z-50 bg-popover border border-border rounded-md shadow-md"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <button
            type="button"
            className="px-3 py-2 text-sm text-foreground bg-popover hover:bg-accent flex items-center gap-2 whitespace-nowrap"
            onClick={handleCopy}
            aria-label={
              contextMenu.selectionLength > 0
                ? "Copy selection"
                : "Copy all output"
            }
          >
            <span className="text-base" aria-hidden>
              ⧉
            </span>
            <span>
              {contextMenu.selectionLength > 0 ? "Copy selection" : "Copy all"}
            </span>
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
  )
}
