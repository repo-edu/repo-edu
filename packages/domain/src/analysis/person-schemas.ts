import { z } from "zod"
import type { PersonDbSnapshot } from "./types.js"

/** Runtime boundary for the identity snapshot passed to blame analysis. */
export const personDbSnapshotSchema = z.strictObject({
  persons: z.array(
    z.strictObject({
      id: z.string(),
      canonicalName: z.string(),
      canonicalEmail: z.string(),
      aliases: z.array(
        z.strictObject({
          name: z.string(),
          email: z.string(),
          evidence: z.enum(["email-link", "name-only"]),
        }),
      ),
      commitCount: z.number().int().nonnegative(),
    }),
  ),
  identityIndex: z.map(z.string(), z.string()),
}) satisfies z.ZodType<PersonDbSnapshot>
