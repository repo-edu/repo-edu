import {
  assignExaminationSourceIds,
  buildExaminationProviderPayloadFingerprint,
  buildExaminationRedactedContentFingerprint,
  EXAMINATION_REDACTION_POLICY_VERSION,
  type ExaminationCodeExcerpt,
  type ExaminationLocalIdentityContext,
  type ExaminationProviderExcerptIdentity,
  type ExaminationSourceReference,
  resolveExaminationSourceDescriptor,
} from "@repo-edu/application-contract"
import type { TokenizerPort } from "@repo-edu/host-runtime-contract"
import {
  buildRedactionPlaceholderPlan,
  type RedactionReport,
  type RedactionRequiredCheck,
  redactExaminationSource,
} from "./redaction.js"
import { stripCommentsForExcerpt } from "./strip-comments.js"

export type ExaminationProviderPromptExcerpt = {
  sourceId: string
  sourceDescriptor: string
  startLine: number
  lines: string[]
}

export type ExaminationProviderPromptPayload = {
  anonymousContributorLabel: string
  questionCount: number
  excerpts: ExaminationProviderPromptExcerpt[]
}

export type PreparedExaminationProviderExcerpts = {
  promptPayload: ExaminationProviderPromptPayload
  providerPayloadFingerprint: string
  sourceReferences: ExaminationSourceReference[]
  redactionReports: RedactionReport[]
  requiredChecks: RedactionRequiredCheck[]
}

function compareRawExcerpts(
  left: ExaminationCodeExcerpt,
  right: ExaminationCodeExcerpt,
): number {
  if (left.filePath !== right.filePath) {
    return left.filePath < right.filePath ? -1 : 1
  }
  return left.startLine - right.startLine
}

function sourceReferenceLineRange(excerpt: ExaminationCodeExcerpt) {
  return {
    start: excerpt.startLine,
    end: excerpt.startLine + excerpt.lines.length - 1,
  }
}

function compareSourceIds(left: string, right: string): number {
  const leftNumber = Number.parseInt(left.slice(1), 10)
  const rightNumber = Number.parseInt(right.slice(1), 10)
  return leftNumber - rightNumber
}

export async function prepareExaminationProviderExcerpts(params: {
  excerpts: readonly ExaminationCodeExcerpt[]
  excerptFileSources: Readonly<Record<string, string>>
  localIdentityContext: ExaminationLocalIdentityContext
  tokenizer: TokenizerPort
  questionCount: number
}): Promise<PreparedExaminationProviderExcerpts> {
  const rawExcerpts = [...params.excerpts].toSorted(compareRawExcerpts)
  const strippedEntries: {
    raw: ExaminationCodeExcerpt
    sourceDescriptor: string
    stripped: Awaited<ReturnType<typeof stripCommentsForExcerpt>>
  }[] = []

  for (const raw of rawExcerpts) {
    strippedEntries.push({
      raw,
      sourceDescriptor: resolveExaminationSourceDescriptor(raw.filePath),
      stripped: await stripCommentsForExcerpt({
        excerpt: raw,
        fileSource: params.excerptFileSources[raw.filePath],
        tokenizer: params.tokenizer,
      }),
    })
  }

  const placeholderPlan = buildRedactionPlaceholderPlan({
    sources: strippedEntries.map((entry) => ({
      lines: entry.stripped.lines,
      spans: entry.stripped.spans,
    })),
    localIdentityContext: params.localIdentityContext,
  })

  const preparedWithoutIds: {
    raw: ExaminationCodeExcerpt
    identity: ExaminationProviderExcerptIdentity
    sourceDescriptor: string
    lines: string[]
    report: RedactionReport
  }[] = []

  for (const entry of strippedEntries) {
    const redacted = redactExaminationSource({
      lines: entry.stripped.lines,
      spans: entry.stripped.spans,
      localIdentityContext: params.localIdentityContext,
      redactionPolicyVersion: EXAMINATION_REDACTION_POLICY_VERSION,
      placeholderPlan,
    })
    preparedWithoutIds.push({
      raw: entry.raw,
      sourceDescriptor: entry.sourceDescriptor,
      lines: redacted.lines,
      report: redacted.report,
      identity: {
        sourceDescriptor: entry.sourceDescriptor,
        tokenizerTreatment: entry.stripped.tokenizerTreatment,
        startLine: entry.raw.startLine,
        lineCount: redacted.lines.length,
        redactedContentFingerprint: buildExaminationRedactedContentFingerprint(
          redacted.lines,
        ),
      },
    })
  }

  const sourceIds = assignExaminationSourceIds(
    preparedWithoutIds.map((entry) => entry.identity),
  )
  const sourceReferenceById = new Map<string, ExaminationSourceReference>()
  const promptExcerptById = new Map<string, ExaminationProviderPromptExcerpt>()
  const requiredChecks: RedactionRequiredCheck[] = []

  for (const [index, prepared] of preparedWithoutIds.entries()) {
    const sourceId = sourceIds[index]
    if (sourceId === undefined) {
      throw new Error("Missing examination source id assignment.")
    }
    if (!promptExcerptById.has(sourceId)) {
      promptExcerptById.set(sourceId, {
        sourceId,
        sourceDescriptor: prepared.sourceDescriptor,
        startLine: prepared.raw.startLine,
        lines: prepared.lines,
      })
    }
    requiredChecks.push(...prepared.report.requiredChecks)

    const reference = sourceReferenceById.get(sourceId) ?? {
      sourceId,
      occurrences: [],
    }
    reference.occurrences.push({
      filePath: prepared.raw.filePath,
      lineRange: sourceReferenceLineRange(prepared.raw),
    })
    sourceReferenceById.set(sourceId, reference)
  }

  const promptExcerpts = [...promptExcerptById.values()].toSorted((a, b) =>
    compareSourceIds(a.sourceId, b.sourceId),
  )

  return {
    promptPayload: {
      anonymousContributorLabel: "Contributor 1",
      questionCount: params.questionCount,
      excerpts: promptExcerpts,
    },
    providerPayloadFingerprint: buildExaminationProviderPayloadFingerprint(
      preparedWithoutIds.map((entry) => entry.identity),
    ),
    sourceReferences: [...sourceReferenceById.values()].toSorted((a, b) =>
      compareSourceIds(a.sourceId, b.sourceId),
    ),
    redactionReports: preparedWithoutIds.map((entry) => entry.report),
    requiredChecks,
  }
}
