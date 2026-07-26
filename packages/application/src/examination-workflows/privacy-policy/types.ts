import type {
  ExaminationLocalIdentityContext,
  ExaminationQuestion,
} from "@repo-edu/application-contract"

export type Span = {
  start: number
  end: number
}

export type SourceSpanKind = "code" | "string-literal"

export type ClassifiedSourceSpan = Span & {
  kind: SourceSpanKind
}

export type RedactionRequiredCheck = {
  kind: ReplacementClass
  value: string
  caseSensitive: boolean
  assertGlobally: boolean
  assertInStringLiteral: boolean
}

export type RedactionReport = {
  redactionPolicyVersion: number
  replacementClasses: string[]
  residualScan: {
    ambiguousKnownIdentifiers: number
    emails: number
    knownIdentifiers: number
    secrets: number
  }
}

export type ExaminationPrivacySource = {
  lines: readonly string[]
  spans: readonly ClassifiedSourceSpan[]
  sourceDescriptor: string
}

export type PreparedExaminationPrivacySource = {
  lines: string[]
  report: RedactionReport
}

declare const examinationPrivacyContextBrand: unique symbol

export type ExaminationPrivacyContext = Readonly<{
  redactionPolicyVersion: number
  [examinationPrivacyContextBrand]: true
}>

export type ExaminationPrivacyPreparation = {
  sources: PreparedExaminationPrivacySource[]
  context: ExaminationPrivacyContext
}

export type ExaminationPrivacyAdmissionReason =
  | "email"
  | "secret"
  | "known-identifier"
  | "redaction-policy-version"

export type ExaminationPrivacyWarning = "ambiguous-known-identifier"

export type ExaminationPrivacyAdmissionResult =
  | { ok: true; warnings: readonly ExaminationPrivacyWarning[] }
  | { ok: false; reason: ExaminationPrivacyAdmissionReason }

export type ReplacementClass =
  | "email"
  | "secret"
  | "name"
  | "opaqueIdentifier"
  | "gitUsername"

export type ReplacementCandidate = Span & {
  replacementClass: ReplacementClass
  value: string
  comparisonKey: string
  caseSensitive: boolean
  assertGlobally: boolean
  assertInStringLiteral: boolean
}

export type RedactionPlaceholderPlan = {
  placeholderByKey: ReadonlyMap<string, string>
}

export type ExaminationPrivacyContextData = {
  requiredChecks: readonly RedactionRequiredCheck[]
  localIdentityContext: ExaminationLocalIdentityContext
  allowedSourceDescriptors: readonly string[]
}

export type QuestionCarrier = {
  questions: readonly ExaminationQuestion[]
  provenance: { redactionPolicyVersion: number }
}
