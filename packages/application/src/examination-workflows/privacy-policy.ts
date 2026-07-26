export {
  admitExaminationQuestions,
  admitExaminationRecord,
  admitExaminationRecordWithoutContext,
  assertExaminationPromptPrivacy,
} from "./privacy-policy/admission.js"
export { prepareExaminationPrivacy } from "./privacy-policy/preparation.js"
export type {
  ClassifiedSourceSpan,
  ExaminationPrivacyAdmissionReason,
  ExaminationPrivacyAdmissionResult,
  ExaminationPrivacyContext,
  ExaminationPrivacyPreparation,
  ExaminationPrivacySource,
  ExaminationPrivacyWarning,
  PreparedExaminationPrivacySource,
  RedactionReport,
  SourceSpanKind,
} from "./privacy-policy/types.js"
