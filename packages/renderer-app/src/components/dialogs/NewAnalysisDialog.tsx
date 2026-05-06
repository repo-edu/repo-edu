/**
 * Dialog for creating a new standalone Analysis. Minimal surface — just a
 * display name. Repository selection happens later in the Analysis tab via
 * the search-folder picker.
 */

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Text,
} from "@repo-edu/ui"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useAnalyses } from "../../hooks/use-analyses.js"
import { useUiStore } from "../../stores/ui-store.js"

export function NewAnalysisDialog() {
  const open = useUiStore((state) => state.newAnalysisDialogOpen)
  const setOpen = useUiStore((state) => state.setNewAnalysisDialogOpen)
  const existingAnalyses = useUiStore((state) => state.analysisList)
  const { createAnalysis } = useAnalyses()

  const [displayName, setDisplayName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isNameTaken = useMemo(() => {
    const normalized = displayName.trim().toLowerCase()
    if (normalized.length === 0) return false
    return existingAnalyses.some(
      (analysis) => analysis.displayName.trim().toLowerCase() === normalized,
    )
  }, [existingAnalyses, displayName])

  const canCreate = displayName.trim().length > 0 && !creating && !isNameTaken

  const reset = useCallback(() => {
    setDisplayName("")
    setCreating(false)
    setError(null)
  }, [])

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const handleClose = () => {
    setOpen(false)
    reset()
  }

  const handleCreate = async () => {
    if (!canCreate) return
    setCreating(true)
    setError(null)
    try {
      const result = await createAnalysis({
        displayName: displayName.trim(),
      })
      if (result === null) {
        setError("Failed to create analysis.")
        return
      }
      handleClose()
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Analysis</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <FormField label="Analysis name" htmlFor="new-analysis-name">
            <Input
              id="new-analysis-name"
              placeholder="e.g., react-router-deep-dive"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canCreate) {
                  void handleCreate()
                }
              }}
              autoFocus
            />
            {isNameTaken && (
              <Text className="text-sm text-destructive mt-1">
                An analysis with this name already exists.
              </Text>
            )}
          </FormField>
          {error && <Text className="text-sm text-destructive">{error}</Text>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!canCreate}>
            {creating ? "Creating..." : "Create Analysis"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
