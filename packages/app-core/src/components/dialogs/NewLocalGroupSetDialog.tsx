/**
 * Dialog for creating a new local group set from an existing group set's groups.
 *
 * The user selects a source group set and optionally filters by pattern.
 * Matched groups are copied (by reference) into the new set at creation time.
 * Post-creation filtering is available via GroupSelectionEditor in GroupSetPanel.
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
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { commands } from "../../bindings/commands"
import {
  selectGroupSets,
  selectGroupsForGroupSet,
  useProfileStore,
} from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"

export function NewLocalGroupSetDialog() {
  const [name, setName] = useState("")
  const [sourceGroupSetId, setSourceGroupSetId] = useState<string | null>(null)
  const [selectionKind, setSelectionKind] = useState<"all" | "pattern">("all")
  const [pattern, setPattern] = useState("")
  const [patternError, setPatternError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const open = useUiStore((state) => state.newLocalGroupSetDialogOpen)
  const setOpen = useUiStore((state) => state.setNewLocalGroupSetDialogOpen)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const createLocalGroupSet = useProfileStore(
    (state) => state.createLocalGroupSet,
  )
  const groupSets = useProfileStore(selectGroupSets)
  const sourceGroups = useProfileStore(
    selectGroupsForGroupSet(sourceGroupSetId ?? ""),
  )

  const sortedGroupSets = useMemo(() => {
    return [...groupSets].sort((a, b) => {
      const aSystem = a.connection?.kind === "system" ? 0 : 1
      const bSystem = b.connection?.kind === "system" ? 0 : 1
      if (aSystem !== bSystem) return aSystem - bSystem
      return a.name.localeCompare(b.name)
    })
  }, [groupSets])

  const trimmedName = name.trim()
  const canCreate =
    trimmedName.length > 0 &&
    sourceGroupSetId !== null &&
    !patternError &&
    !creating

  // Debounced pattern validation
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationIdRef = useRef(0)

  const validatePattern = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        const requestId = ++validationIdRef.current
        const groupNames = sourceGroups.map((g) => g.name)
        try {
          const result = await commands.filterByPattern(value, groupNames)
          if (validationIdRef.current !== requestId) return
          if (result.status === "ok" && result.data.valid) {
            setPatternError(null)
          } else {
            setPatternError(
              result.status === "ok"
                ? (result.data.error ?? "Invalid pattern")
                : result.error.message,
            )
          }
        } catch {
          if (validationIdRef.current !== requestId) return
          setPatternError("Failed to validate pattern")
        }
      }, 400)
    },
    [sourceGroups],
  )

  // Re-validate when source changes while in pattern mode
  useEffect(() => {
    if (selectionKind === "pattern" && pattern) {
      validatePattern(pattern)
    }
  }, [sourceGroupSetId, selectionKind, pattern, validatePattern])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handlePatternChange = (value: string) => {
    setPattern(value)
    if (!value) {
      setPatternError(null)
      return
    }
    validatePattern(value)
  }

  const handleCreate = async () => {
    if (!canCreate || !sourceGroupSetId) return

    setCreating(true)
    try {
      let groupIds: string[]
      if (selectionKind === "all" || !pattern) {
        groupIds = sourceGroups.map((g) => g.id)
      } else {
        const groupNames = sourceGroups.map((g) => g.name)
        const result = await commands.filterByPattern(pattern, groupNames)
        if (result.status !== "ok" || !result.data.valid) {
          setPatternError(
            result.status === "ok"
              ? (result.data.error ?? "Invalid pattern")
              : result.error.message,
          )
          return
        }
        groupIds = result.data.matched_indexes.map((i) => sourceGroups[i].id)
      }

      const id = createLocalGroupSet(trimmedName, groupIds)
      if (id) {
        setSidebarSelection({ kind: "group-set", id })
      }
      handleClose()
    } finally {
      setCreating(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setName("")
    setSourceGroupSetId(null)
    setSelectionKind("all")
    setPattern("")
    setPatternError(null)
    setCreating(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Local Group Set</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <FormField label="Name" htmlFor="group-set-name">
            <Input
              id="group-set-name"
              placeholder="e.g., Project Teams"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) handleCreate()
              }}
              autoFocus
            />
          </FormField>

          <FormField label="Source group set" htmlFor="source-gs-select">
            <Select
              value={sourceGroupSetId ?? undefined}
              onValueChange={setSourceGroupSetId}
            >
              <SelectTrigger id="source-gs-select">
                <SelectValue placeholder="Select a group set" />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                {sortedGroupSets.map((gs) => (
                  <SelectItem key={gs.id} value={gs.id}>
                    {gs.name}
                    {gs.connection?.kind === "system" ? " (System)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {sourceGroupSetId && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Group selection</Label>
              <RadioGroup
                value={selectionKind}
                onValueChange={(v) => setSelectionKind(v as "all" | "pattern")}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="new-gs-sel-all" />
                  <Label htmlFor="new-gs-sel-all" className="text-sm">
                    All groups ({sourceGroups.length})
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="pattern" id="new-gs-sel-pattern" />
                  <Label htmlFor="new-gs-sel-pattern" className="text-sm">
                    Pattern filter
                  </Label>
                </div>
              </RadioGroup>
              {selectionKind === "pattern" && (
                <div className="pl-6 space-y-1.5">
                  <Input
                    value={pattern}
                    onChange={(e) => handlePatternChange(e.target.value)}
                    placeholder="e.g., 1D* or Team-*"
                    className="h-7 text-sm"
                  />
                  {patternError ? (
                    <p className="text-[11px] text-destructive">
                      {patternError}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Glob pattern matched against group names. Use * for
                      wildcard.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
