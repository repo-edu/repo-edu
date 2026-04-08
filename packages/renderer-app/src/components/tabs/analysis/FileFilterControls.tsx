import {
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Label,
} from "@repo-edu/ui"
import { ChevronDown, ChevronRight } from "@repo-edu/ui/components/icons"
import { useCallback, useMemo, useState } from "react"
import { useAnalysisStore } from "../../../stores/analysis-store.js"

type FolderGroup = {
  folder: string
  paths: string[]
}

const ROOT_FOLDER_LABEL = "(root)"

function parentFolder(path: string): string {
  const index = path.lastIndexOf("/")
  if (index < 0) {
    return ROOT_FOLDER_LABEL
  }
  return path.slice(0, index)
}

export function FileFilterControls() {
  const result = useAnalysisStore((s) => s.result)
  const selectedFiles = useAnalysisStore((s) => s.selectedFiles)
  const setSelectedFiles = useAnalysisStore((s) => s.setSelectedFiles)
  const clearFileSelection = useAnalysisStore((s) => s.clearFileSelection)

  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())

  const allFilePaths = useMemo(
    () => (result?.fileStats ?? []).map((file) => file.path).sort(),
    [result],
  )

  const groups = useMemo<FolderGroup[]>(() => {
    const map = new Map<string, string[]>()
    for (const path of allFilePaths) {
      const folder = parentFolder(path)
      const next = map.get(folder) ?? []
      next.push(path)
      map.set(folder, next)
    }

    return [...map.entries()]
      .map(([folder, paths]) => ({
        folder,
        paths: paths.sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.folder.localeCompare(b.folder))
  }, [allFilePaths])

  const effectiveSelection = useMemo(() => {
    if (selectedFiles.size === 0) {
      return new Set(allFilePaths)
    }
    return selectedFiles
  }, [allFilePaths, selectedFiles])

  const commitSelection = useCallback(
    (next: Set<string>) => {
      if (next.size >= allFilePaths.length) {
        clearFileSelection()
        return
      }
      setSelectedFiles(next)
    },
    [allFilePaths.length, clearFileSelection, setSelectedFiles],
  )

  const toggleFolderOpen = useCallback((folder: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) {
        next.delete(folder)
      } else {
        next.add(folder)
      }
      return next
    })
  }, [])

  const togglePath = useCallback(
    (path: string) => {
      const next = new Set(effectiveSelection)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      commitSelection(next)
    },
    [commitSelection, effectiveSelection],
  )

  const selectFolder = useCallback(
    (paths: readonly string[]) => {
      const next = new Set(effectiveSelection)
      for (const path of paths) {
        next.add(path)
      }
      commitSelection(next)
    },
    [commitSelection, effectiveSelection],
  )

  const clearFolder = useCallback(
    (paths: readonly string[]) => {
      const next = new Set(effectiveSelection)
      for (const path of paths) {
        next.delete(path)
      }
      commitSelection(next)
    },
    [commitSelection, effectiveSelection],
  )

  if (allFilePaths.length === 0) {
    return null
  }

  return (
    <div className="border-t px-3 py-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Filter Files
        </span>
        <span className="text-xs text-muted-foreground">
          {effectiveSelection.size}/{allFilePaths.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {groups.map((group) => {
          const selectedCount = group.paths.filter((path) =>
            effectiveSelection.has(path),
          ).length
          const isOpen = openFolders.has(group.folder)

          return (
            <Collapsible
              key={group.folder}
              open={isOpen}
              onOpenChange={() => toggleFolderOpen(group.folder)}
            >
              <div className="rounded border">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs">
                    {isOpen ? (
                      <ChevronDown className="size-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0" />
                    )}
                    <span className="truncate">{group.folder}</span>
                    <span className="text-muted-foreground">
                      ({selectedCount}/{group.paths.length})
                    </span>
                  </CollapsibleTrigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    disabled={selectedCount === group.paths.length}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      selectFolder(group.paths)
                    }}
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    disabled={selectedCount === 0}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      clearFolder(group.paths)
                    }}
                  >
                    Clear
                  </Button>
                </div>
                <CollapsibleContent className="border-t px-2 py-2 space-y-1.5">
                  {group.paths.map((path) => {
                    const checked = effectiveSelection.has(path)
                    const display =
                      group.folder === ROOT_FOLDER_LABEL
                        ? path
                        : path.slice(group.folder.length + 1)
                    return (
                      <div key={path} className="flex items-center gap-1.5">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => togglePath(path)}
                        />
                        <Label className="text-xs truncate">{display}</Label>
                      </div>
                    )
                  })}
                </CollapsibleContent>
              </div>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}
