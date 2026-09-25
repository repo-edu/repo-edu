import type { ExaminationPrepareSubmissionSourceInput } from "@repo-edu/application-contract"
import type { SessionOperationScope } from "../../../session/session-operations.js"
import { useExaminationStore } from "../../../stores/examination-store.js"
import type { SubmissionExaminationSource } from "./source.js"

export function submissionPreparationKey(
  input: ExaminationPrepareSubmissionSourceInput,
): string {
  return JSON.stringify([
    input.folderPath,
    [...input.selectedRelativePaths].sort(),
    [...input.configuredExtensions].sort(),
    input.attachedRosterIdentities,
  ])
}

export async function prepareSubmissionSource(
  scope: SessionOperationScope,
  input: ExaminationPrepareSubmissionSourceInput,
): Promise<SubmissionExaminationSource> {
  const key = submissionPreparationKey(input)
  const cached = useExaminationStore
    .getState()
    .preparedSubmissionSources.get(key)
  if (cached !== undefined) return cached
  const result = await scope.run("examination.prepareSubmissionSource", input)
  const source: SubmissionExaminationSource = {
    kind: "submission",
    folderPath: result.folderPath,
    contentScopeId: result.contentScopeId,
    subject: {
      id: result.personId,
      name: result.displayTitle,
      email: result.displaySubtitle,
      lines: result.excerpts.reduce(
        (count, excerpt) => count + excerpt.lines.length,
        0,
      ),
      linesPercent: 100,
      excerpts: result.excerpts,
      excerptFileSources: result.excerptFileSources,
      excerptScopeId: result.contentScopeId,
    },
    localIdentityContext: result.localIdentityContext,
  }
  scope.publish(() =>
    useExaminationStore.getState().setPreparedSubmissionSource(key, source),
  )
  return source
}
