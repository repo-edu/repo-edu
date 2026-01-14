import type { OutputLevel } from "@repo-edu/backend-interface/types"
import { Button, cn } from "@repo-edu/ui"
import type { CSSProperties } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { OUTPUT_NEAR_BOTTOM_PX } from "../constants"
import { selectOutputLines, useOutputStore } from "../stores"

interface OutputConsoleProps {
  className?: string
  style?: CSSProperties
}

interface ContextMenuState {
  x: number
  y: number
  hasSelection: boolean
}

const levelColors: Record<OutputLevel, string> = {
  info: "text-muted-foreground",
  success: "text-green-600 dark:text-green-400",
  warning: "text-yellow-600 dark:text-yellow-400",
  error: "text-red-600 dark:text-red-400",
}

export function OutputConsole({ className, style }: OutputConsoleProps) {
  const lines = useOutputStore(selectOutputLines)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Compute plain text for copy operations
  const plainText = useMemo(
    () => lines.map((line) => line.message).join("\n"),
    [lines],
  )

  useEffect(() => {
    if (atBottom && containerRef.current) {
      const el = containerRef.current
      el.scrollTop = el.scrollHeight
    }
  }, [lines, atBottom])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    window.addEventListener("click", handleClick)
    return () => window.removeEventListener("click", handleClick)
  }, [contextMenu])

  const handleScroll = () => {
    if (!containerRef.current) return
    const el = containerRef.current
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < OUTPUT_NEAR_BOTTOM_PX
    setAtBottom(nearBottom)
  }

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      setAtBottom(true)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const selection = window.getSelection()
    const hasSelection = selection !== null && selection.toString().length > 0
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      hasSelection,
    })
  }

  const handleCopy = () => {
    const selection = window.getSelection()
    const hasSelection = selection !== null && selection.toString().length > 0
    const textToCopy = hasSelection ? selection.toString() : plainText
    navigator.clipboard.writeText(textToCopy)
    setContextMenu(null)
  }

  return (
    <div
      className={cn("relative flex-1 min-h-0 flex flex-col", className)}
      style={style}
    >
      <div
        ref={containerRef}
        role="log"
        onScroll={handleScroll}
        onContextMenu={handleContextMenu}
        className="font-mono text-xs console-output console-panel flex-1 overflow-auto p-2 select-text"
      >
        {lines.length === 0 ? (
          <span className="text-muted-foreground">
            Output will appear here...
          </span>
        ) : (
          lines.map((line, index) => (
            <div
              key={index}
              className={cn("whitespace-pre-wrap", levelColors[line.level])}
            >
              {line.message}
            </div>
          ))
        )}
      </div>
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
            className="px-3 py-2 bg-popover hover:bg-accent flex items-center gap-2 whitespace-nowrap"
            onClick={handleCopy}
            aria-label={
              contextMenu.hasSelection ? "Copy selection" : "Copy all output"
            }
          >
            <span className="text-base" aria-hidden>
              ⧉
            </span>
            <span>
              {contextMenu.hasSelection ? "Copy selection" : "Copy all"}
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
