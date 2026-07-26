import {
  canonicalizeExaminationLocalIdentityContext,
  type ExaminationLocalIdentityContext,
} from "@repo-edu/application-contract"
import { normalizeKnownText } from "./detection.js"
import type {
  ExaminationPrivacyContext,
  ExaminationPrivacyContextData,
  RedactionRequiredCheck,
} from "./types.js"

const contextData = new WeakMap<
  ExaminationPrivacyContext,
  ExaminationPrivacyContextData
>()

function freezeIdentityContext(
  input: ExaminationLocalIdentityContext,
): ExaminationLocalIdentityContext {
  const canonical = canonicalizeExaminationLocalIdentityContext(input)
  return Object.freeze({
    names: Object.freeze([...canonical.names]),
    emails: Object.freeze([...canonical.emails]),
    opaqueIdentifiers: Object.freeze([...canonical.opaqueIdentifiers]),
    gitUsernames: Object.freeze([...canonical.gitUsernames]),
  }) as ExaminationLocalIdentityContext
}

function canonicalSourceDescriptors(values: readonly string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => normalizeKnownText(value).toLowerCase())
        .filter((value) => value.length > 0),
    ),
  ].toSorted()
}

export function createExaminationPrivacyContext(params: {
  redactionPolicyVersion: number
  requiredChecks: readonly RedactionRequiredCheck[]
  localIdentityContext: ExaminationLocalIdentityContext
  allowedSourceDescriptors: readonly string[]
}): ExaminationPrivacyContext {
  const context = Object.freeze({
    redactionPolicyVersion: params.redactionPolicyVersion,
  }) as ExaminationPrivacyContext
  contextData.set(
    context,
    Object.freeze({
      requiredChecks: Object.freeze(
        params.requiredChecks.map((check) => Object.freeze({ ...check })),
      ),
      localIdentityContext: freezeIdentityContext(params.localIdentityContext),
      allowedSourceDescriptors: Object.freeze(
        canonicalSourceDescriptors(params.allowedSourceDescriptors),
      ),
    }),
  )
  return context
}

export function readExaminationPrivacyContext(
  context: ExaminationPrivacyContext,
): ExaminationPrivacyContextData {
  const data = contextData.get(context)
  if (data === undefined) {
    throw new TypeError("Invalid examination privacy context.")
  }
  return data
}
