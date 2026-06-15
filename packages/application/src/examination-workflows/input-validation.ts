import type {
  ExaminationGenerateQuestionsInput,
  ExaminationLocalIdentityContext,
  ExaminationLookupQuestionSummariesInput,
  ExaminationLookupQuestionsInput,
} from "@repo-edu/application-contract"
import { isExaminationContentScopeIdShape } from "@repo-edu/application-contract"
import {
  validatePersistedAppCredentials,
  validatePersistedAppPreferences,
} from "@repo-edu/domain/schemas"
import {
  defaultAppCredentials,
  defaultAppPreferences,
} from "@repo-edu/domain/settings"
import { createValidationAppError } from "../core.js"

type InputIssue = { path: string; message: string }

export function validateGenerateInput(
  input: ExaminationGenerateQuestionsInput,
): void {
  validateInput(input, "generate")
}

export function validateLookupInput(
  input: ExaminationLookupQuestionsInput,
): void {
  validateInput(input, "lookup")
}

export function validateLookupSummariesInput(
  input: ExaminationLookupQuestionSummariesInput,
): void {
  const issues: InputIssue[] = []
  if (!isRecord(input)) {
    throw createValidationAppError(
      "Examination summary lookup input is invalid.",
      [{ path: "input", message: "Input must be an object." }],
    )
  }
  if (!Array.isArray(input.subjects)) {
    throw createValidationAppError(
      "Examination summary lookup input is invalid.",
      [{ path: "subjects", message: "subjects must be an array." }],
    )
  }
  for (const [index, subject] of input.subjects.entries()) {
    const prefix = `subjects.${index}`
    if (!isRecord(subject)) {
      issues.push({
        path: prefix,
        message: "Subject summary input is invalid.",
      })
      continue
    }
    if (
      typeof subject.subjectId !== "string" ||
      subject.subjectId.trim().length === 0
    ) {
      issues.push({
        path: `${prefix}.subjectId`,
        message: "subjectId is required.",
      })
    }
    if (
      typeof subject.personId !== "string" ||
      subject.personId.trim().length === 0
    ) {
      issues.push({
        path: `${prefix}.personId`,
        message: "personId is required.",
      })
    }
    if (
      typeof subject.contentScopeId !== "string" ||
      !isExaminationContentScopeIdShape(subject.contentScopeId)
    ) {
      issues.push({
        path: `${prefix}.contentScopeId`,
        message:
          "contentScopeId must be a full lowercase SHA-1 or SHA-256 content identifier.",
      })
    }
    validateLocalIdentityContext(subject.localIdentityContext, issues, prefix)
    validateExcerpts(subject.excerpts, issues, prefix)
    validateExcerptFileSources(subject.excerptFileSources, issues, prefix)
  }
  if (issues.length > 0) {
    throw createValidationAppError(
      "Examination summary lookup input is invalid.",
      issues,
    )
  }
}

export function validateStopInput(input: {
  generationControlId: string
}): void {
  if (
    !isRecord(input) ||
    typeof input.generationControlId !== "string" ||
    input.generationControlId.trim().length === 0
  ) {
    throw createValidationAppError("Examination stop input is invalid.", [
      {
        path: "generationControlId",
        message: "generationControlId is required.",
      },
    ])
  }
}

function validateInput(
  input: ExaminationGenerateQuestionsInput | ExaminationLookupQuestionsInput,
  mode: "generate" | "lookup",
): void {
  const issues: InputIssue[] = []
  if (!isRecord(input)) {
    throw createValidationAppError("Examination input is invalid.", [
      { path: "input", message: "Input must be an object." },
    ])
  }
  const allowed = new Set([
    "personId",
    "contentScopeId",
    "localIdentityContext",
    "excerpts",
    "excerptFileSources",
    "questionCount",
    "llmSettings",
    ...(mode === "generate"
      ? ["generationControlId", "regenerate", "seedQuestions"]
      : []),
  ])
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) {
      issues.push({ path: field, message: "Unknown field." })
    }
  }
  if (
    typeof input.personId !== "string" ||
    input.personId.trim().length === 0
  ) {
    issues.push({ path: "personId", message: "personId is required." })
  }
  if (
    typeof input.contentScopeId !== "string" ||
    !isExaminationContentScopeIdShape(input.contentScopeId)
  ) {
    issues.push({
      path: "contentScopeId",
      message:
        "contentScopeId must be a full lowercase SHA-1 or SHA-256 content identifier.",
    })
  }
  validateLocalIdentityContext(input.localIdentityContext, issues)
  if (
    !Number.isInteger(input.questionCount) ||
    input.questionCount < 1 ||
    input.questionCount > 20
  ) {
    issues.push({
      path: "questionCount",
      message: "questionCount must be between 1 and 20.",
    })
  }
  validateExcerpts(input.excerpts, issues)
  validateExcerptFileSources(input.excerptFileSources, issues)
  validateLlmSettings(input.llmSettings, issues)
  if (
    "regenerate" in input &&
    input.regenerate !== undefined &&
    typeof input.regenerate !== "boolean"
  ) {
    issues.push({
      path: "regenerate",
      message: "regenerate must be a boolean when present.",
    })
  }
  if (mode === "generate" && "seedQuestions" in input) {
    validateSeedQuestions(input.seedQuestions, input.questionCount, issues)
  }
  if (
    mode === "generate" &&
    (!("generationControlId" in input) ||
      typeof input.generationControlId !== "string" ||
      input.generationControlId.trim().length === 0)
  ) {
    issues.push({
      path: "generationControlId",
      message: "generationControlId is required.",
    })
  }
  if (issues.length > 0) {
    throw createValidationAppError("Examination input is invalid.", issues)
  }
}

function validateSeedQuestions(
  seedQuestions: ExaminationGenerateQuestionsInput["seedQuestions"],
  questionCount: number,
  issues: InputIssue[],
): void {
  if (seedQuestions === undefined) return
  if (!Array.isArray(seedQuestions)) {
    issues.push({
      path: "seedQuestions",
      message: "seedQuestions must be an array when present.",
    })
    return
  }
  if (
    Number.isInteger(questionCount) &&
    seedQuestions.length >= questionCount
  ) {
    issues.push({
      path: "seedQuestions",
      message: "seedQuestions must leave at least one question to generate.",
    })
  }
  for (const [index, question] of seedQuestions.entries()) {
    if (!isRecord(question)) {
      issues.push({
        path: `seedQuestions.${index}`,
        message: "Seed question is invalid.",
      })
      continue
    }
    if (
      typeof question.question !== "string" ||
      question.question.trim().length === 0
    ) {
      issues.push({
        path: `seedQuestions.${index}.question`,
        message: "Seed question text is required.",
      })
    }
    if (
      typeof question.answer !== "string" ||
      question.answer.trim().length === 0
    ) {
      issues.push({
        path: `seedQuestions.${index}.answer`,
        message: "Seed answer text is required.",
      })
    }
    validateSeedQuestionAnchor(
      question.anchor,
      `seedQuestions.${index}`,
      issues,
    )
  }
}

function validateSeedQuestionAnchor(
  anchor: unknown,
  path: string,
  issues: { path: string; message: string }[],
): void {
  if (!isRecord(anchor)) {
    issues.push({
      path: `${path}.anchor`,
      message: "Seed question anchor is required.",
    })
    return
  }
  if (anchor.sourceId !== null && typeof anchor.sourceId !== "string") {
    issues.push({
      path: `${path}.anchor.sourceId`,
      message: "Seed question anchor sourceId must be a string or null.",
    })
  }
  const { lineRange } = anchor
  if (lineRange === null) return
  if (!isRecord(lineRange)) {
    issues.push({
      path: `${path}.anchor.lineRange`,
      message: "Seed question anchor lineRange must be an object or null.",
    })
    return
  }
  if (
    !Number.isInteger(lineRange.start) ||
    !Number.isInteger(lineRange.end) ||
    (typeof lineRange.start === "number" &&
      typeof lineRange.end === "number" &&
      lineRange.end < lineRange.start)
  ) {
    issues.push({
      path: `${path}.anchor.lineRange`,
      message:
        "Seed question lineRange must contain valid start and end lines.",
    })
  }
}

function validateLocalIdentityContext(
  context: ExaminationLocalIdentityContext,
  issues: InputIssue[],
  prefix?: string,
): void {
  const basePath =
    prefix === undefined
      ? "localIdentityContext"
      : `${prefix}.localIdentityContext`
  if (!isRecord(context)) {
    issues.push({
      path: basePath,
      message: "localIdentityContext is required.",
    })
    return
  }
  for (const field of [
    "names",
    "emails",
    "opaqueIdentifiers",
    "gitUsernames",
  ]) {
    const value = context[field as keyof ExaminationLocalIdentityContext]
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string")
    ) {
      issues.push({
        path: `${basePath}.${field}`,
        message: `${field} must be an array of strings.`,
      })
    }
  }
}

function validateExcerpts(
  excerpts: ExaminationGenerateQuestionsInput["excerpts"],
  issues: InputIssue[],
  prefix?: string,
): void {
  const basePath = prefix === undefined ? "excerpts" : `${prefix}.excerpts`
  if (!Array.isArray(excerpts) || excerpts.length === 0) {
    issues.push({
      path: basePath,
      message: "At least one code excerpt is required.",
    })
    return
  }
  for (const [index, excerpt] of excerpts.entries()) {
    if (!isRecord(excerpt)) {
      issues.push({
        path: `${basePath}.${index}`,
        message: "Excerpt is invalid.",
      })
      continue
    }
    if (
      typeof excerpt.filePath !== "string" ||
      excerpt.filePath.trim().length === 0
    ) {
      issues.push({
        path: `${basePath}.${index}.filePath`,
        message: "filePath is required for local source lookup.",
      })
    }
    if (!Number.isInteger(excerpt.startLine) || excerpt.startLine < 1) {
      issues.push({
        path: `${basePath}.${index}.startLine`,
        message: "startLine must be a 1-based positive integer.",
      })
    }
    if (
      !Array.isArray(excerpt.lines) ||
      excerpt.lines.length === 0 ||
      excerpt.lines.some((line) => typeof line !== "string")
    ) {
      issues.push({
        path: `${basePath}.${index}.lines`,
        message: "Excerpt must contain at least one string line.",
      })
    }
  }
}

function validateExcerptFileSources(
  sources: ExaminationGenerateQuestionsInput["excerptFileSources"],
  issues: InputIssue[],
  prefix?: string,
): void {
  const basePath =
    prefix === undefined ? "excerptFileSources" : `${prefix}.excerptFileSources`
  if (!isRecord(sources)) {
    issues.push({
      path: basePath,
      message: "excerptFileSources must be an object.",
    })
    return
  }
  for (const [filePath, source] of Object.entries(sources)) {
    if (filePath.length === 0 || typeof source !== "string") {
      issues.push({
        path: `${basePath}.${filePath}`,
        message: "Each file source must be keyed by path and contain text.",
      })
    }
  }
}

function validateLlmSettings(value: unknown, issues: InputIssue[]): void {
  if (value === undefined || value === null) {
    issues.push({
      path: "llmSettings",
      message: "llmSettings is required.",
    })
    return
  }
  if (!isRecord(value)) {
    issues.push({
      path: "llmSettings",
      message: "llmSettings must be an object.",
    })
    return
  }

  const credentials = validatePersistedAppCredentials({
    ...defaultAppCredentials,
    llmConnections: value.llmConnections,
    activeLlmConnectionId: value.activeLlmConnectionId,
  })
  if (!credentials.ok) {
    for (const issue of credentials.issues) {
      issues.push({
        path: `llmSettings.${issue.path}`,
        message: issue.message,
      })
    }
  }

  const preferences = validatePersistedAppPreferences({
    ...defaultAppPreferences,
    examinationModelsByProvider: value.examinationModelsByProvider,
  })
  if (!preferences.ok) {
    for (const issue of preferences.issues) {
      issues.push({
        path: `llmSettings.${issue.path}`,
        message: issue.message,
      })
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
