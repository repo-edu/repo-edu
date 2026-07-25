import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import type { LlmEffort } from "@repo-edu/integrations-llm-contract"
import {
  EXAMINATION_QUESTION_COUNT_MAX,
  EXAMINATION_QUESTION_COUNT_MIN,
} from "./constants.js"
import { isExaminationContentScopeIdShape } from "./content-scope.js"

const EXAMINATION_ARCHIVE_STORAGE_KEY_VERSION =
  "examination-archive-key-v3" as const
const EXAMINATION_GENERATION_CONTEXT_VERSION =
  "examination-generation-context-v2" as const
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

export type ExaminationArchiveKey = {
  personId: string
  contentScopeId: string
  questionCount: number
  providerPayloadFingerprint: string
  generationContextFingerprint: string
}

export type ExaminationGenerationContext = {
  model: string
  effort: LlmEffort
  promptTemplateVersion: number
  redactionPolicyVersion: number
}

export type ExaminationGenerationContextCanonical = ExaminationGenerationContext

function sha256Hex(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)))
}

export function canonicalizeExaminationGenerationContext(
  context: ExaminationGenerationContext,
): ExaminationGenerationContextCanonical {
  return {
    model: context.model,
    effort: context.effort,
    promptTemplateVersion: context.promptTemplateVersion,
    redactionPolicyVersion: context.redactionPolicyVersion,
  }
}

export function buildExaminationGenerationContextFingerprint(
  context: ExaminationGenerationContext,
): string {
  const canonical = canonicalizeExaminationGenerationContext(context)
  return sha256Hex(
    JSON.stringify([
      EXAMINATION_GENERATION_CONTEXT_VERSION,
      canonical.model,
      canonical.effort,
      canonical.promptTemplateVersion,
      canonical.redactionPolicyVersion,
    ]),
  )
}

export function serializeExaminationArchiveStorageKey(
  key: ExaminationArchiveKey,
): string {
  return JSON.stringify([
    EXAMINATION_ARCHIVE_STORAGE_KEY_VERSION,
    key.personId,
    key.contentScopeId,
    key.questionCount,
    key.providerPayloadFingerprint,
    key.generationContextFingerprint,
  ])
}

export function parseExaminationArchiveStorageKey(
  storageKey: string,
): ExaminationArchiveKey | null {
  let raw: unknown
  try {
    raw = JSON.parse(storageKey)
  } catch {
    return null
  }
  if (!Array.isArray(raw) || raw.length !== 6) return null
  const [
    version,
    personId,
    contentScopeId,
    questionCount,
    providerPayloadFingerprint,
    generationContextFingerprint,
  ] = raw
  if (version !== EXAMINATION_ARCHIVE_STORAGE_KEY_VERSION) return null
  return validateExaminationArchiveKey({
    personId,
    contentScopeId,
    questionCount,
    providerPayloadFingerprint,
    generationContextFingerprint,
  })
}

export function validateExaminationArchiveKey(
  raw: unknown,
): ExaminationArchiveKey | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null
  }
  const record = raw as Record<string, unknown>
  const allowedFields = new Set([
    "personId",
    "contentScopeId",
    "questionCount",
    "providerPayloadFingerprint",
    "generationContextFingerprint",
  ])
  if (Object.keys(record).some((field) => !allowedFields.has(field))) {
    return null
  }
  const {
    personId,
    contentScopeId,
    questionCount,
    providerPayloadFingerprint,
    generationContextFingerprint,
  } = record
  if (
    typeof personId !== "string" ||
    personId.length === 0 ||
    typeof contentScopeId !== "string" ||
    !isExaminationContentScopeIdShape(contentScopeId) ||
    typeof questionCount !== "number" ||
    !Number.isInteger(questionCount) ||
    questionCount < EXAMINATION_QUESTION_COUNT_MIN ||
    questionCount > EXAMINATION_QUESTION_COUNT_MAX ||
    typeof providerPayloadFingerprint !== "string" ||
    !SHA256_HEX_PATTERN.test(providerPayloadFingerprint) ||
    typeof generationContextFingerprint !== "string" ||
    !SHA256_HEX_PATTERN.test(generationContextFingerprint)
  ) {
    return null
  }
  return {
    personId,
    contentScopeId,
    questionCount,
    providerPayloadFingerprint,
    generationContextFingerprint,
  }
}
