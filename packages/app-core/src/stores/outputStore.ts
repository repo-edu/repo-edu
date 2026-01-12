/**
 * Output store - manages structured output lines for the console.
 * Uses OutputLine[] instead of raw text for structured display.
 */

import { create } from "zustand"
import type { OutputLevel, OutputLine } from "@repo-edu/backend-interface/types"

interface OutputState {
  lines: OutputLine[]
  /**
   * @deprecated Use lines instead. This property is for legacy compatibility.
   */
  text: string
}

interface OutputActions {
  /**
   * Append a structured output line
   */
  append: (line: OutputLine) => void

  /**
   * Append a simple text line with a level
   */
  appendText: (message: string, level?: OutputLevel) => void

  /**
   * Clear all output
   */
  clear: () => void

  /**
   * Replace all lines
   */
  setLines: (lines: OutputLine[]) => void

  /**
   * Update the last line if it's a progress/info line, otherwise append.
   * Used for progress updates that should replace the previous progress message.
   */
  updateLastLine: (line: OutputLine) => void

  // Legacy compatibility methods (will be removed in Phase 6)
  /**
   * @deprecated Use appendText() instead
   */
  appendWithNewline: (message: string) => void
  /**
   * @deprecated Use setLines() instead
   */
  setText: (text: string) => void
}

interface OutputStore extends OutputState, OutputActions {}

export const useOutputStore = create<OutputStore>((set, get) => ({
  lines: [],
  // Legacy text property - computed from lines
  // Note: This is updated when lines change for legacy compatibility
  text: "",

  append: (line) =>
    set((state) => {
      const newLines = [...state.lines, line]
      return {
        lines: newLines,
        text: newLines.map((l) => l.message).join("\n"),
      }
    }),

  appendText: (message, level = "info") =>
    set((state) => {
      const newLines = [...state.lines, { message, level }]
      return {
        lines: newLines,
        text: newLines.map((l) => l.message).join("\n"),
      }
    }),

  clear: () => set({ lines: [], text: "" }),

  setLines: (lines) =>
    set({
      lines,
      text: lines.map((l) => l.message).join("\n"),
    }),

  updateLastLine: (line) =>
    set((state) => {
      let newLines: OutputLine[]
      if (state.lines.length === 0) {
        newLines = [line]
      } else {
        const lastLine = state.lines[state.lines.length - 1]
        // Only replace if the last line is info level (progress indicator)
        // Success, warning, and error lines should not be replaced
        if (lastLine.level === "info") {
          newLines = [...state.lines]
          newLines[newLines.length - 1] = line
        } else {
          // Otherwise append the new line
          newLines = [...state.lines, line]
        }
      }
      return {
        lines: newLines,
        text: newLines.map((l) => l.message).join("\n"),
      }
    }),

  // Legacy compatibility methods
  appendWithNewline: (message) => {
    get().appendText(message, "info")
  },

  setText: (text) => {
    const lines: OutputLine[] = text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((message) => ({ message, level: "info" as OutputLevel }))
    set({
      lines,
      text: lines.map((l) => l.message).join("\n"),
    })
  },
}))

// Selector helpers
export const selectOutputLines = (state: OutputStore) => state.lines

/**
 * Convert lines to plain text for display compatibility
 */
export const selectOutputText = (state: OutputStore): string =>
  state.lines.map((line) => line.message).join("\n")
