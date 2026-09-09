import { fileFormats } from "@repo-edu/domain/types"
import type {
  UserFileRef,
  UserSaveTargetRef,
} from "@repo-edu/host-runtime-contract"
import { z } from "zod"

// The port contract is types-only. These cross-surface workflow boundaries
// validate references without interpreting their host-owned identity.
export const userFileRefSchema = z.strictObject({
  kind: z.literal("user-file-ref"),
  referenceId: z.string(),
  displayName: z.string(),
  mediaType: z.string().nullable(),
  byteLength: z.number().int().nonnegative().nullable(),
}) satisfies z.ZodType<UserFileRef>

export const userSaveTargetRefSchema = z.strictObject({
  kind: z.literal("user-save-target-ref"),
  referenceId: z.string(),
  displayName: z.string(),
  suggestedFormat: z.enum(fileFormats).nullable(),
}) satisfies z.ZodType<UserSaveTargetRef>
