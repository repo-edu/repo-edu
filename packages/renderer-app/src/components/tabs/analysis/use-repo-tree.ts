import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import { useCourseStore } from "../../../stores/course-store.js"
import { buildFileTree, collectFolderPaths } from "./analysis-tree.js"

export type RepoTree = ReturnType<typeof useRepoTree>

export function useRepoTree() {
  const searchFolder = useCourseStore((s) => s.course?.searchFolder) ?? null
  const discoveredRepos = useAnalysisStore((s) => s.discoveredRepos)

  const [openRepoFolders, setOpenRepoFolders] = useState<Set<string>>(new Set())

  const { repoPathByRelative, searchFolderIsRepo } = useMemo(() => {
    if (!searchFolder) {
      return {
        repoPathByRelative: new Map<string, string>(),
        searchFolderIsRepo: false,
      }
    }
    const normalized = searchFolder.replaceAll("\\", "/")
    const base = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
    const prefix = `${base}/`
    const map = new Map<string, string>()
    let isRepo = false
    for (const repo of discoveredRepos) {
      const repoNormalized = repo.path.replaceAll("\\", "/")
      const isSelf = repoNormalized === base
      if (isSelf) isRepo = true
      const relative = isSelf
        ? repo.name
        : repoNormalized.startsWith(prefix)
          ? repoNormalized.slice(prefix.length)
          : repoNormalized
      map.set(relative, repo.path)
    }
    return {
      repoPathByRelative: map,
      searchFolderIsRepo: isRepo && discoveredRepos.length === 1,
    }
  }, [searchFolder, discoveredRepos])

  const repoTree = useMemo(
    () => buildFileTree([...repoPathByRelative.keys()]),
    [repoPathByRelative],
  )

  const allRepoFolderNames = useMemo(
    () => collectFolderPaths(repoTree),
    [repoTree],
  )

  const searchFolderName = useMemo(() => {
    const folder = searchFolder ?? ""
    return folder.slice(folder.lastIndexOf("/") + 1)
  }, [searchFolder])

  const expandedForFolder = useRef<string | null>(null)

  useEffect(() => {
    if (searchFolder === expandedForFolder.current) return
    expandedForFolder.current = searchFolder
    setOpenRepoFolders(new Set(allRepoFolderNames))
  }, [searchFolder, allRepoFolderNames])

  const toggleRepoFolderOpen = useCallback((folder: string) => {
    setOpenRepoFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }, [])

  const expandAllRepoFolders = useCallback(
    () => setOpenRepoFolders(new Set(allRepoFolderNames)),
    [allRepoFolderNames],
  )

  const collapseAllRepoFolders = useCallback(
    () => setOpenRepoFolders(new Set()),
    [],
  )

  return {
    repoTree,
    repoPathByRelative,
    openRepoFolders,
    searchFolderName,
    searchFolderIsRepo,
    toggleRepoFolderOpen,
    expandAllRepoFolders,
    collapseAllRepoFolders,
  }
}
