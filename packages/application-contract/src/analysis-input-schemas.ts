import {
  analysisBlameConfigSchema,
  analysisConfigSchema,
  personDbSnapshotSchema,
} from "@repo-edu/domain/analysis"
import { rosterMemberSchema } from "@repo-edu/domain/schemas"
import { z } from "zod"

const relativeRepository = {
  repositoryRelativePath: z.string(),
  repositoryAbsolutePath: z.undefined().optional(),
  course: z.strictObject({
    repositoryCloneTargetDirectory: z.string().nullable().optional(),
  }),
}
const absoluteRepository = {
  repositoryAbsolutePath: z.string(),
  repositoryRelativePath: z.undefined().optional(),
  course: z.undefined().optional(),
}

function repositoryInput<T extends z.ZodRawShape>(fields: T) {
  return z.union([
    z.strictObject({ ...relativeRepository, ...fields }),
    z.strictObject({ ...absoluteRepository, ...fields }),
  ])
}

export const analysisRunInputSchema = repositoryInput({
  config: analysisConfigSchema,
  analysisSource: z
    .discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("course"),
        rosterContext: z
          .strictObject({ members: z.array(rosterMemberSchema) })
          .optional(),
      }),
      z.strictObject({ kind: z.literal("folder") }),
    ])
    .optional(),
  snapshotCommitOid: z.string(),
})

export const analysisBlameInputSchema = repositoryInput({
  config: analysisBlameConfigSchema,
  personDbBaseline: personDbSnapshotSchema,
  files: z.array(z.string()),
  snapshotCommitOid: z.string(),
})

export const analysisResolveSnapshotHeadInputSchema = repositoryInput({
  asOfCommit: z.string().optional(),
  until: z.string().optional(),
})
