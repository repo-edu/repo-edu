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

export async function prepareExaminationProviderExcerpts(params: {
  excerpts: readonly ExaminationCodeExcerpt[]
  excerptFileSources: Readonly<Record<string, string>>
  localIdentityContext: ExaminationLocalIdentityContext
  tokenizer: TokenizerPort
  questionCount: number
}): Promise<PreparedExaminationProviderExcerpts> {
  const rawExcerpts = [...params.excerpts].toSorted(compareRawExcerpts)
  const preparedWithoutIds: {
    raw: ExaminationCodeExcerpt
    identity: ExaminationProviderExcerptIdentity
    sourceDescriptor: string
    lines: string[]
    report: RedactionReport
  }[] = []

  for (const raw of rawExcerpts) {
    const stripped = await stripCommentsForExcerpt({
      excerpt: raw,
      fileSource: params.excerptFileSources[raw.filePath],
      tokenizer: params.tokenizer,
    })
    const redacted = redactExaminationSource({
      lines: stripped.lines,
      spans: stripped.spans,
      localIdentityContext: params.localIdentityContext,
      redactionPolicyVersion: EXAMINATION_REDACTION_POLICY_VERSION,
    })
    const sourceDescriptor = resolveExaminationSourceDescriptor(raw.filePath)
    preparedWithoutIds.push({
      raw,
      sourceDescriptor,
      lines: redacted.lines,
      report: redacted.report,
      identity: {
        sourceDescriptor,
        tokenizerTreatment: stripped.tokenizerTreatment,
        startLine: raw.startLine,
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
  const promptExcerpts: ExaminationProviderPromptExcerpt[] = []
  const requiredChecks: RedactionRequiredCheck[] = []

  for (const [index, prepared] of preparedWithoutIds.entries()) {
    const sourceId = sourceIds[index]
    if (sourceId === undefined) {
      throw new Error("Missing examination source id assignment.")
    }
    promptExcerpts.push({
      sourceId,
      sourceDescriptor: prepared.sourceDescriptor,
      startLine: prepared.raw.startLine,
      lines: prepared.lines,
    })
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
      a.sourceId.localeCompare(b.sourceId),
    ),
    redactionReports: preparedWithoutIds.map((entry) => entry.report),
    requiredChecks,
  }
}
