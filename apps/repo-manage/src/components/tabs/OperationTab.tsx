/**
 * OperationTab - Repository operations: Create, Clone, Delete.
 */

import {
  Button,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@repo-edu/ui"
import { AlertCircle, FolderOpen, Loader2 } from "@repo-edu/ui/components/icons"
import { open } from "@tauri-apps/plugin-dialog"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import type {
  AppError,
  AssignmentId,
  CloneConfig,
  CreateConfig,
  DeleteConfig,
  DirectoryLayout,
  OperationResult,
  Result,
} from "../../bindings/types"
import { useOperationStore } from "../../stores/operationStore"
import { useOutputStore } from "../../stores/outputStore"
import { useProfileSettingsStore } from "../../stores/profileSettingsStore"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"

type OperationType = "create" | "clone" | "delete"

export function OperationTab() {
  const roster = useRosterStore((state) => state.roster)
  const assignments = roster?.assignments ?? []
  const activeProfile = useUiStore((state) => state.activeProfile)
  const operations = useProfileSettingsStore((state) => state.operations)

  const operationSelected = useOperationStore((state) => state.selected)
  const setOperationSelected = useOperationStore((state) => state.setSelected)
  const operationStatus = useOperationStore((state) => state.status)
  const setOperationStatus = useOperationStore((state) => state.setStatus)
  const setOperationError = useOperationStore((state) => state.setError)

  const append = useOutputStore((state) => state.append)

  // Local form state
  const [selectedAssignmentId, setSelectedAssignmentId] =
    useState<AssignmentId | null>(null)
  const [templateOrg, setTemplateOrg] = useState(
    operations.create.template_org ?? "",
  )
  const [targetOrg, setTargetOrg] = useState(operations.target_org ?? "")
  const [targetDir, setTargetDir] = useState(operations.clone.target_dir ?? "")
  const [directoryLayout, setDirectoryLayout] = useState<DirectoryLayout>(
    operations.clone.directory_layout ?? "flat",
  )

  const selectedAssignment = assignments.find(
    (a) => a.id === selectedAssignmentId,
  )
  const groupCount = selectedAssignment?.groups.length ?? 0
  const validGroupCount =
    selectedAssignment?.groups.filter((g) => g.member_ids.length > 0).length ??
    0

  const handleBrowseFolder = async () => {
    const result = await open({ directory: true, multiple: false })
    if (result && typeof result === "string") {
      setTargetDir(result)
    }
  }

  const handleExecute = async () => {
    if (!activeProfile || !roster || !selectedAssignmentId) {
      return
    }

    setOperationStatus("running")
    setOperationError(null)

    try {
      let result: Result<OperationResult, AppError>

      switch (operationSelected) {
        case "create": {
          const config: CreateConfig = { template_org: templateOrg }
          append({
            message: `Creating ${validGroupCount} repositories...`,
            level: "info",
          })
          result = await commands.createRepos(
            activeProfile,
            roster,
            selectedAssignmentId,
            config,
          )
          break
        }
        case "clone": {
          const config: CloneConfig = {
            target_dir: targetDir,
            directory_layout: directoryLayout,
          }
          append({
            message: `Cloning ${validGroupCount} repositories...`,
            level: "info",
          })
          result = await commands.cloneReposFromRoster(
            activeProfile,
            roster,
            selectedAssignmentId,
            config,
          )
          break
        }
        case "delete": {
          const config: DeleteConfig = {}
          append({
            message: `Deleting ${validGroupCount} repositories...`,
            level: "warning",
          })
          result = await commands.deleteRepos(
            activeProfile,
            roster,
            selectedAssignmentId,
            config,
          )
          break
        }
      }

      if (result.status === "error") {
        setOperationStatus("error")
        setOperationError(result.error.message)
        append({ message: `Error: ${result.error.message}`, level: "error" })
        return
      }

      const data = result.data
      setOperationStatus("success")

      // Report results
      if (data.succeeded > 0) {
        append({
          message: `✓ ${data.succeeded} repositories ${operationSelected}d successfully`,
          level: "success",
        })
      }
      if (data.failed > 0) {
        append({
          message: `✗ ${data.failed} repositories failed`,
          level: "error",
        })
      }
      if (data.skipped_groups.length > 0) {
        append({
          message: `⚠ ${data.skipped_groups.length} groups skipped`,
          level: "warning",
        })
      }
      for (const error of data.errors) {
        append({
          message: `  ${error.repo_name}: ${error.message}`,
          level: "error",
        })
      }
    } catch (error) {
      setOperationStatus("error")
      const message = error instanceof Error ? error.message : String(error)
      setOperationError(message)
      append({ message: `Error: ${message}`, level: "error" })
    }
  }

  const isExecuteDisabled =
    !selectedAssignmentId ||
    validGroupCount === 0 ||
    operationStatus === "running" ||
    (operationSelected === "clone" && !targetDir) ||
    !activeProfile

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Operation Type Tabs */}
      <Tabs
        value={operationSelected}
        onValueChange={(v) => setOperationSelected(v as OperationType)}
      >
        <TabsList>
          <TabsTrigger value="create">Create Repos</TabsTrigger>
          <TabsTrigger value="clone">Clone</TabsTrigger>
          <TabsTrigger value="delete">Delete</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Common Fields */}
      <div className="grid grid-cols-[auto_1fr] items-center gap-4">
        <Label htmlFor="assignment">Assignment</Label>
        <Select
          value={selectedAssignmentId ?? ""}
          onValueChange={(v) => setSelectedAssignmentId(v as AssignmentId)}
        >
          <SelectTrigger id="assignment" className="w-80">
            <SelectValue placeholder="Select an assignment" />
          </SelectTrigger>
          <SelectContent>
            {assignments.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Operation-specific fields */}
        {operationSelected === "create" && (
          <>
            <Label htmlFor="templateOrg">Template Org</Label>
            <Input
              id="templateOrg"
              value={templateOrg}
              onChange={(e) => setTemplateOrg(e.target.value)}
              className="w-80"
              placeholder="e.g., tue-5lia0-templates"
            />
          </>
        )}

        <Label htmlFor="targetOrg">Target Org</Label>
        <Input
          id="targetOrg"
          value={targetOrg}
          onChange={(e) => setTargetOrg(e.target.value)}
          className="w-80"
          placeholder="e.g., tue-5lia0-2024"
        />

        {operationSelected === "clone" && (
          <>
            <Label htmlFor="targetDir">Target Folder</Label>
            <div className="flex gap-2">
              <Input
                id="targetDir"
                value={targetDir}
                onChange={(e) => setTargetDir(e.target.value)}
                className="w-64"
                placeholder="~/repos/5lia0-2024"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleBrowseFolder}
              >
                <FolderOpen className="size-4" />
              </Button>
            </div>

            <Label>Directory Layout</Label>
            <RadioGroup
              value={directoryLayout}
              onValueChange={(v) => setDirectoryLayout(v as DirectoryLayout)}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="flat" id="flat" />
                <Label htmlFor="flat" className="font-normal">
                  Flat
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="by-team" id="by-team" />
                <Label htmlFor="by-team" className="font-normal">
                  By Team
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="by-task" id="by-task" />
                <Label htmlFor="by-task" className="font-normal">
                  By Task
                </Label>
              </div>
            </RadioGroup>
          </>
        )}
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        {selectedAssignment ? (
          <>
            {validGroupCount} repositories will be{" "}
            {operationSelected === "create"
              ? "created"
              : operationSelected === "clone"
                ? "cloned"
                : "deleted"}
            {groupCount !== validGroupCount && (
              <span className="ml-2 text-warning">
                <AlertCircle className="inline-block size-4 mr-1" />
                {groupCount - validGroupCount} empty groups will be skipped
              </span>
            )}
          </>
        ) : (
          "Select an assignment to see repository count"
        )}
      </div>

      {/* Execute Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleExecute}
          disabled={isExecuteDisabled}
          variant={operationSelected === "delete" ? "destructive" : "default"}
          className="min-w-36"
        >
          {operationStatus === "running" ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Running...
            </>
          ) : operationSelected === "create" ? (
            "Create Repos"
          ) : operationSelected === "clone" ? (
            "Clone Repos"
          ) : (
            "Delete Repos"
          )}
        </Button>
      </div>
    </div>
  )
}
