import { Channel } from "@tauri-apps/api/core";

interface Options {
  onProgress: (line: string) => void;
}

/**
 * Creates a Channel that writes progress lines via onProgress, updating the last line when prefixed.
 */
export function useProgressChannel({ onProgress }: Options) {
  const progress = new Channel<string>();

  progress.onmessage = (msg: string) => {
    const PROGRESS_PREFIX = "[PROGRESS]";
    if (msg.startsWith(PROGRESS_PREFIX)) {
      const displayLine = msg.slice(PROGRESS_PREFIX.length).trimStart();
      onProgress(`(progress) ${displayLine}`);
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
  updateLast: (line: string) => void,
  getLastLine: () => string
) {
  const PROGRESS_PREFIX = "(progress)";
  if (msg.startsWith(PROGRESS_PREFIX)) {
    updateLast(msg);
  } else {
    append(msg);
  }
}
