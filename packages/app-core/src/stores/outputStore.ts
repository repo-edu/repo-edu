/**
 * Output store - manages structured output lines for the console.
 * Uses OutputLine[] for structured display with level-based styling.
 */

import type { OutputLevel, OutputLine } from "@repo-edu/backend-interface/types"
import { create } from "zustand"

interface OutputState {
  lines: OutputLine[]
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
}

interface OutputStore extends OutputState, OutputActions {}

export const useOutputStore = create<OutputStore>((set) => ({
  lines: [],

  append: (line) =>
    set((state) => ({
      lines: [...state.lines, line],
    })),

  appendText: (message, level = "info") =>
    set((state) => ({
      lines: [...state.lines, { message, level }],
    })),

  clear: () => set({ lines: [] }),

  setLines: (lines) => set({ lines }),

  updateLastLine: (line) =>
    set((state) => {
      if (state.lines.length === 0) {
        return { lines: [line] }
      }
      const lastLine = state.lines[state.lines.length - 1]
      // Only replace if the last line is info level (progress indicator)
      // Success, warning, and error lines should not be replaced
      if (lastLine.level === "info") {
        const newLines = [...state.lines]
        newLines[newLines.length - 1] = line
        return { lines: newLines }
      }
      // Otherwise append the new line
      return { lines: [...state.lines, line] }
    }),
}))

// Selector helpers
export const selectOutputLines = (state: OutputStore) => state.lines
