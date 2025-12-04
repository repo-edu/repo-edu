import { create } from "zustand";
import { BACKEND_PROGRESS_PREFIX, DISPLAY_PROGRESS_PREFIX } from "../constants";

interface OutputState {
  text: string;
}

interface OutputStore extends OutputState {
  append: (line: string) => void;
  appendWithNewline: (line: string) => void;
  clear: () => void;
  setText: (text: string) => void;
  updateLastLine: (line: string) => void;
}

export const useOutputStore = create<OutputStore>((set) => ({
  text: "",

  append: (line) => set((s) => ({ text: s.text + line })),

  appendWithNewline: (line) => set((s) => ({ text: s.text + line + "\n" })),

  clear: () => set({ text: "" }),

  setText: (text) => set({ text }),

  updateLastLine: (line) =>
    set((s) => {
      const lines = s.text.split("\n");
      // Remove trailing empty lines
      while (lines.length && lines[lines.length - 1].trim() === "") {
        lines.pop();
      }
      // Check if last line is a progress line and replace it
      const isProgressLine = (val: string) =>
        val.startsWith(BACKEND_PROGRESS_PREFIX) || val.startsWith(DISPLAY_PROGRESS_PREFIX);
      if (lines.length > 0 && isProgressLine(lines[lines.length - 1])) {
        lines[lines.length - 1] = line;
      } else {
        lines.push(line);
      }
      return { text: lines.join("\n") + "\n" };
    }),
}));
