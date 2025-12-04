import { Channel } from "@tauri-apps/api/core";
import { BACKEND_PROGRESS_PREFIX, DISPLAY_PROGRESS_PREFIX } from "../constants";

interface Options {
  onProgress: (line: string) => void;
}

/**
 * Creates a Channel that writes progress lines via onProgress, updating the last line when prefixed.
 */
export function useProgressChannel({ onProgress }: Options) {
  const progress = new Channel<string>();

  progress.onmessage = (msg: string) => {
    if (msg.startsWith(BACKEND_PROGRESS_PREFIX)) {
      const displayLine = msg.slice(BACKEND_PROGRESS_PREFIX.length).trimStart();
      onProgress(`${DISPLAY_PROGRESS_PREFIX} ${displayLine}`);
    } else {
      onProgress(msg);
    }
  };

  return progress;
}

/**
 * Convenience helper to update output store lines in a consistent way.
 */
export function handleProgressMessage(
  msg: string,
  append: (line: string) => void,
  updateLast: (line: string) => void
) {
  if (msg.startsWith(DISPLAY_PROGRESS_PREFIX)) {
    updateLast(msg);
  } else {
    append(msg);
  }
}
