import type { FileBlame } from "@repo-edu/domain/analysis"
import type { PersistentCache } from "@repo-edu/host-runtime-contract"
import {
  createByteBudgetedLru,
  createLayeredCache,
  type LayeredCache,
  structuredJsonSerde,
} from "../cache/layered-cache.js"

export type BlameFileCache = LayeredCache<FileBlame>

export type BlameFileCacheOptions = {
  cache: PersistentCache
  hotBytes: number
  disabled?: boolean
}

export function createBlameFileCache(
  options: BlameFileCacheOptions,
): BlameFileCache {
  return createLayeredCache<FileBlame>({
    hot: createByteBudgetedLru(options.hotBytes),
    cold: options.cache,
    serde: structuredJsonSerde<FileBlame>(),
    disabled: options.disabled,
  })
}
