import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@repo-edu/ui"
import { Search } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { useAnalysisStore } from "../../../stores/analysis-store.js"

export function BlameFilePickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const result = useAnalysisStore((s) => s.result)
  const blameTargetFiles = useAnalysisStore((s) => s.blameTargetFiles)
  const openFileForBlame = useAnalysisStore((s) => s.openFileForBlame)

  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allFiles = result?.fileStats.map((f) => f.path) ?? []
  const alreadyOpen = new Set(blameTargetFiles)
  const filterLower = filter.toLowerCase()
  const filtered = allFiles.filter((p) =>
    filterLower.length > 0 ? p.toLowerCase().includes(filterLower) : true,
  )

  const toggleFile = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleOpen = () => {
    for (const path of selected) {
      openFileForBlame(path)
    }
    setSelected(new Set())
    setFilter("")
    onOpenChange(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelected(new Set())
      setFilter("")
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Files for Blame Analysis</DialogTitle>
          <DialogDescription>
            Select files to open in the blame viewer.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Filter files..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1 rounded border p-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                No files match the filter.
              </p>
            ) : (
              filtered.map((path) => {
                const isAlreadyOpen = alreadyOpen.has(path)
                const isSelected = selected.has(path)
                return (
                  <div key={path} className="flex items-center gap-2 py-0.5">
                    <Checkbox
                      id={`file-${path}`}
                      checked={isAlreadyOpen || isSelected}
                      disabled={isAlreadyOpen}
                      onCheckedChange={() => toggleFile(path)}
                    />
                    <Label
                      htmlFor={`file-${path}`}
                      className={`text-xs truncate ${isAlreadyOpen ? "text-muted-foreground" : ""}`}
                    >
                      {path}
                      {isAlreadyOpen && (
                        <span className="ml-1 text-muted-foreground">
                          (open)
                        </span>
                      )}
                    </Label>
                  </div>
                )
              })
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={selected.size === 0} onClick={handleOpen}>
            Open Selected ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
