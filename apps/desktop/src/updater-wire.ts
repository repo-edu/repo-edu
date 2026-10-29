import { z } from "zod"

/** Presentation messages owned by the updater transport (Decision 21). */
export const updaterMessageSchemas = {
  onUpdateAvailable: z.strictObject({ version: z.string() }),
  onUpdateDownloaded: z.undefined(),
  onUpdateError: z.strictObject({ message: z.string() }),
  onDownloadProgress: z.strictObject({
    percent: z.number(),
    bytesPerSecond: z.number(),
    transferred: z.number(),
    total: z.number(),
  }),
} as const

export const updaterMessageChannels = {
  onUpdateAvailable: "repo-edu/updater/on-update-available",
  onUpdateDownloaded: "repo-edu/updater/on-update-downloaded",
  onUpdateError: "repo-edu/updater/on-update-error",
  onDownloadProgress: "repo-edu/updater/on-download-progress",
} as const satisfies Record<keyof typeof updaterMessageSchemas, string>

export type UpdaterMessage<K extends keyof typeof updaterMessageSchemas> =
  z.infer<(typeof updaterMessageSchemas)[K]>

export function parseUpdaterMessage<
  K extends keyof typeof updaterMessageSchemas,
>(kind: K, value: unknown): UpdaterMessage<K> {
  return updaterMessageSchemas[kind].parse(value) as UpdaterMessage<K>
}
