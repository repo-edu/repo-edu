import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import { buildFileTree, collectFolderPaths } from "./analysis-tree.js"

export function useRepoTree() {
  const searchFolder = useAnalysisStore((s) => s.searchFolder)
  const discoveredRepos = useAnalysisStore((s) => s.discoveredRepos)

  const [openRepoFolders, setOpenRepoFolders] = useState<Set<string>>(new Set())

  const repoPathByRelative = useMemo(() => {
    if (!searchFolder) return new Map<string, string>()
    const normalized = searchFolder.replaceAll("\\", "/")
    const base = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
    const prefix = `${base}/`
    const map = new Map<string, string>()
    for (const repo of discoveredRepos) {
      const repoNormalized = repo.path.replaceAll("\\", "/")
      const relative =
        repoNormalized === base
          ? repo.name
          : repoNormalized.startsWith(prefix)
            ? repoNormalized.slice(prefix.length)
            : repoNormalized
      map.set(relative, repo.path)
    }
    return map
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
    toggleRepoFolderOpen,
    expandAllRepoFolders,
    collapseAllRepoFolders,
  }
}
