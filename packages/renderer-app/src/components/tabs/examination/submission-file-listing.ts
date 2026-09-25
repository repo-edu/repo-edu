import type { SubmissionFolderRecent } from "@repo-edu/domain/active-surface"
import {
  DEFAULT_EXTENSIONS,
  normalizeExtension,
} from "@repo-edu/domain/analysis"
import type { SessionOperationScope } from "../../../session/session-operations.js"
import { useExaminationStore } from "../../../stores/examination-store.js"
import { getErrorMessage } from "../../../utils/error-message.js"

export function normalizeConfiguredExtensions(
  extensions: readonly string[],
): string[] {
  const normalized = [
    ...new Set(
      extensions
        .map((extension) => normalizeExtension(extension))
        .filter((extension) => extension.length > 0),
    ),
  ]
  return normalized.length === 0 ? [...DEFAULT_EXTENSIONS] : normalized
}

export async function listSubmissionFiles(
  scope: SessionOperationScope,
  folderPath: string,
  extensions: string[],
): Promise<void> {
  const setListing = useExaminationStore.getState().setSubmissionFileList
  scope.publish(() =>
    useExaminationStore.getState().discardPreparedSubmissionSources(folderPath),
  )
  scope.publish(() =>
    setListing(folderPath, { status: "loading", files: [], error: null }),
  )
  try {
    const result = await scope.run("analysis.listFolderFiles", {
      folderPath,
      extensions,
    })
    scope.publish(() =>
      setListing(folderPath, {
        status: "loaded",
        files: result.files,
        extensions,
        error: null,
      }),
    )
  } catch (error) {
    if (scope.signal.aborted) return
    scope.publish(() =>
      setListing(folderPath, {
        status: "error",
        files: [],
        error: getErrorMessage(error),
      }),
    )
  }
}

export async function openSubmissionFolder(
  scope: SessionOperationScope,
  recent: SubmissionFolderRecent,
  extensions: string[],
  reuseListing: boolean,
): Promise<void> {
  const activated = await scope.activateSurface({
    kind: "submission",
    ...recent,
  })
  if (!activated) return
  const listing = useExaminationStore
    .getState()
    .submissionFileLists.get(recent.path)
  if (
    reuseListing &&
    listing?.status === "loaded" &&
    listing.extensions.length === extensions.length &&
    listing.extensions.every((extension) => extensions.includes(extension))
  ) {
    return
  }
  await listSubmissionFiles(scope, recent.path, extensions)
}
