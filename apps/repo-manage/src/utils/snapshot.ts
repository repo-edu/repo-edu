/**
 * Lightweight, deterministic hashing for plain data snapshots.
 * Uses FNV-1a 32-bit; good enough for dirty checking without crypto.
 */
export function hashSnapshot(value: unknown): number {
  const str = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // force unsigned
}

/**
 * Convenience helper to deep-clone plain data for baselines.
 */
export function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

