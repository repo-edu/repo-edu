import { useMemo } from "react"
import {
  selectFileSelectionModeForScope,
  selectSelectedAuthorsForScope,
  selectSelectedFilesForScope,
  useAnalysisStore,
} from "../stores/analysis-store.js"
import type { AnalysisObservation } from "./analysis-observation.js"
import {
  buildAuthorColorsByPersonId,
  buildAuthorDisplayByPersonId,
  buildRosterMatchByPersonId,
  filterAuthorStats,
  filterFileStats,
  mergeAuthorStats,
  mergeFileStats,
} from "./analysis-view-models.js"

export function useAnalysisViews({
  analysisScopeKey,
  result,
  blameResult,
  blamePartialAuthorLines,
}: Pick<
  AnalysisObservation,
  "analysisScopeKey" | "result" | "blameResult" | "blamePartialAuthorLines"
>) {
  const selectedAuthors = useAnalysisStore((state) =>
    selectSelectedAuthorsForScope(state, analysisScopeKey),
  )
  const fileSelectionMode = useAnalysisStore((state) =>
    selectFileSelectionModeForScope(state, analysisScopeKey),
  )
  const selectedFiles = useAnalysisStore((state) =>
    selectSelectedFilesForScope(state, analysisScopeKey),
  )
  const showRenames = useAnalysisStore((state) => state.showRenames)

  const mergedAuthorStats = useMemo(
    () =>
      mergeAuthorStats({
        result,
        blameResult,
        partialAuthorLines: blamePartialAuthorLines,
      }),
    [blamePartialAuthorLines, blameResult, result],
  )
  const filteredAuthorStats = useMemo(
    () => filterAuthorStats(mergedAuthorStats, selectedAuthors),
    [mergedAuthorStats, selectedAuthors],
  )
  const mergedFileStats = useMemo(
    () => mergeFileStats({ result, blameResult }),
    [blameResult, result],
  )
  const filteredFileStats = useMemo(
    () =>
      filterFileStats({
        merged: mergedFileStats,
        fileSelectionMode,
        selectedFiles,
      }),
    [fileSelectionMode, mergedFileStats, selectedFiles],
  )
  const authorColorsByPersonId = useMemo(
    () => buildAuthorColorsByPersonId(mergedAuthorStats),
    [mergedAuthorStats],
  )
  const authorDisplayByPersonId = useMemo(
    () => buildAuthorDisplayByPersonId({ result, showRenames }),
    [result, showRenames],
  )
  const rosterMatchByPersonId = useMemo(
    () => buildRosterMatchByPersonId(result),
    [result],
  )

  return {
    mergedAuthorStats,
    filteredAuthorStats,
    mergedFileStats,
    filteredFileStats,
    authorColorsByPersonId,
    authorDisplayByPersonId,
    rosterMatchByPersonId,
  }
}
