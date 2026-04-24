import type {
  PersistentCache,
  PersistentCacheSetEntry,
} from "@repo-edu/host-runtime-contract"

// ---------------------------------------------------------------------------
// Stable hash for cache key strings. Three independent FNV-1a-32 derivatives
// (forward, length-prefixed, reversed) concatenate to ~96 bits — low enough
// collision risk that a wrong cache hit serving wrong blame output is
// effectively impossible at realistic cache populations, without pulling in
// a cryptographic hash. Browser-safe.
// ---------------------------------------------------------------------------

const FNV_PRIME = 0x01000193
const FNV_OFFSET = 0x811c9dc5

export function fnv1a32Hex(input: string): string {
  let hash = FNV_OFFSET
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function fnv1a32HexReverse(input: string): string {
  let hash = FNV_OFFSET
  for (let i = input.length - 1; i >= 0; i--) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function hashCacheKey(input: string): string {
  return `${fnv1a32Hex(input)}${fnv1a32Hex(`${input.length}:${input}`)}${fnv1a32HexReverse(input)}`
}

// ---------------------------------------------------------------------------
// Typed serialization bridge (application layer owns shape, cold layer sees bytes)
// ---------------------------------------------------------------------------

export type CacheSerde<TValue> = {
  toBytes(value: TValue): Uint8Array
  fromBytes(bytes: Uint8Array): TValue
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

// Reserved key for the `Map`/`Set` revival marker. Deliberately exotic so
// no realistic domain JSON payload can collide with it; a colliding key
// would be misrevived on read.
const STRUCTURED_TAG = "__$repoEduStructured$__"

type StructuredMarker =
  | { [STRUCTURED_TAG]: "Map"; entries: [unknown, unknown][] }
  | { [STRUCTURED_TAG]: "Set"; values: unknown[] }

function structuredReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return {
      [STRUCTURED_TAG]: "Map",
      entries: [...value],
    } satisfies StructuredMarker
  }
  if (value instanceof Set) {
    return {
      [STRUCTURED_TAG]: "Set",
      values: [...value],
    } satisfies StructuredMarker
  }
  return value
}

function structuredReviver(_key: string, value: unknown): unknown {
  if (!value || typeof value !== "object") return value
  const tag = (value as Record<string, unknown>)[STRUCTURED_TAG]
  if (tag === "Map") {
    return new Map((value as { entries: [unknown, unknown][] }).entries)
  }
  if (tag === "Set") {
    return new Set((value as { values: unknown[] }).values)
  }
  return value
}

/**
 * JSON serde that transparently preserves `Map` and `Set` instances, so
 * domain types with those fields can round-trip through the byte cache
 * without per-type serialization helpers.
 */
export function structuredJsonSerde<TValue>(): CacheSerde<TValue> {
  return {
    toBytes(value) {
      return textEncoder.encode(JSON.stringify(value, structuredReplacer))
    },
    fromBytes(bytes) {
      return JSON.parse(textDecoder.decode(bytes), structuredReviver) as TValue
    },
  }
}

// ---------------------------------------------------------------------------
// Shared no-op cold cache — used by the in-memory analysis cache and by any
// caller wanting to compose a hot-only layered cache.
// ---------------------------------------------------------------------------

export const noopPersistentCache: PersistentCache = {
  get: () => undefined,
  set: () => {},
  getMany: (keys) => keys.map(() => undefined),
  setMany: () => {},
  touch: () => {},
  touchMany: () => {},
  clear: () => {},
  stats: () => ({ sizeBytes: 0, entryCount: 0 }),
  close: () => {},
}

// ---------------------------------------------------------------------------
// Hot LRU — typed, byte-budgeted
// ---------------------------------------------------------------------------

export type HotCache<TValue> = {
  get(key: string): TValue | undefined
  set(key: string, value: TValue, sizeBytes: number): void
  clear(): void
  size(): { bytes: number; entries: number }
}

/**
 * In-process LRU that stores typed values alongside a size hint (in bytes,
 * uncompressed). Eviction budgets by total size, not entry count, so that
 * a few giant `AnalysisResult`s and thousands of small `FileBlame`s can
 * share the same implementation under different caps.
 */
export function createByteBudgetedLru<TValue>(
  maxBytes: number,
): HotCache<TValue> {
  const entries = new Map<string, { value: TValue; bytes: number }>()
  let totalBytes = 0

  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return undefined
      entries.delete(key)
      entries.set(key, entry)
      return entry.value
    },
    set(key, value, sizeBytes) {
      const existing = entries.get(key)
      if (existing) {
        totalBytes -= existing.bytes
        entries.delete(key)
      }
      entries.set(key, { value, bytes: sizeBytes })
      totalBytes += sizeBytes
      while (totalBytes > maxBytes && entries.size > 0) {
        const oldestKey = entries.keys().next().value
        if (oldestKey === undefined) break
        const oldest = entries.get(oldestKey)
        if (!oldest) {
          entries.delete(oldestKey)
          continue
        }
        entries.delete(oldestKey)
        totalBytes -= oldest.bytes
      }
    },
    clear() {
      entries.clear()
      totalBytes = 0
    },
    size() {
      return { bytes: totalBytes, entries: entries.size }
    },
  }
}

// ---------------------------------------------------------------------------
// Layered cache — hot (typed) over cold (bytes) with uniform get/set surface
// ---------------------------------------------------------------------------

export type LayeredCache<TValue> = {
  get(key: string): TValue | undefined
  set(key: string, value: TValue): void
  getMany(keys: readonly string[]): (TValue | undefined)[]
  setMany(entries: readonly { key: string; value: TValue }[]): void
  clear(): void
  stats(): {
    hotBytes: number
    hotEntries: number
    coldBytes: number
    coldEntries: number
  }
}

type CreateLayeredCacheOptions<TValue> = {
  hot: HotCache<TValue>
  cold: PersistentCache
  serde: CacheSerde<TValue>
  disabled?: boolean
}

/**
 * Composes an in-process LRU over a persistent byte cache. Callers see a
 * typed interface; the cold layer never sees the value shape, and the hot
 * layer never sees bytes. When `disabled=true`, reads and writes bypass
 * both layers but `clear()` and `stats()` still forward to cold so the
 * Storage UI can inspect/wipe on-disk data without re-enabling the cache.
 */
export function createLayeredCache<TValue>(
  options: CreateLayeredCacheOptions<TValue>,
): LayeredCache<TValue> {
  const { hot, cold, serde, disabled = false } = options

  function decodeIntoHot(key: string, bytes: Uint8Array): TValue | undefined {
    try {
      const decoded = serde.fromBytes(bytes)
      hot.set(key, decoded, bytes.byteLength)
      return decoded
    } catch {
      return undefined
    }
  }

  return {
    get(key) {
      if (disabled) return undefined
      const fromHot = hot.get(key)
      if (fromHot !== undefined) {
        // Always touch cold too so LRU tracks actual usage.
        cold.touch(key)
        return fromHot
      }
      const fromCold = cold.get(key)
      return fromCold !== undefined
        ? decodeIntoHot(key, fromCold.bytes)
        : undefined
    },

    set(key, value) {
      if (disabled) return
      const bytes = serde.toBytes(value)
      hot.set(key, value, bytes.byteLength)
      cold.set(key, bytes)
    },

    getMany(keys) {
      if (disabled || keys.length === 0)
        return keys.map(() => undefined as TValue | undefined)
      const out: (TValue | undefined)[] = new Array(keys.length)
      const hotKeys: string[] = []
      const missKeys: string[] = []
      const missIndexes: number[] = []
      for (let i = 0; i < keys.length; i++) {
        const hotHit = hot.get(keys[i])
        if (hotHit !== undefined) {
          out[i] = hotHit
          hotKeys.push(keys[i])
          continue
        }
        missKeys.push(keys[i])
        missIndexes.push(i)
      }
      if (hotKeys.length > 0) cold.touchMany(hotKeys)
      const coldResults = cold.getMany(missKeys)
      for (let i = 0; i < missKeys.length; i++) {
        const entry = coldResults[i]
        out[missIndexes[i]] = entry
          ? decodeIntoHot(missKeys[i], entry.bytes)
          : undefined
      }
      return out
    },

    setMany(pairs) {
      if (disabled || pairs.length === 0) return
      const coldEntries: PersistentCacheSetEntry[] = new Array(pairs.length)
      for (let i = 0; i < pairs.length; i++) {
        const bytes = serde.toBytes(pairs[i].value)
        hot.set(pairs[i].key, pairs[i].value, bytes.byteLength)
        coldEntries[i] = { key: pairs[i].key, bytes }
      }
      cold.setMany(coldEntries)
    },

    clear() {
      hot.clear()
      cold.clear()
    },

    stats() {
      const hotStats = hot.size()
      const coldStats = cold.stats()
      return {
        hotBytes: disabled ? 0 : hotStats.bytes,
        hotEntries: disabled ? 0 : hotStats.entries,
        coldBytes: coldStats.sizeBytes,
        coldEntries: coldStats.entryCount,
      }
    },
  }
}
