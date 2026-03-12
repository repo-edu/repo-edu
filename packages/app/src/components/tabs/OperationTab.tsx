import type { RepositoryBatchResult } from "@repo-edu/application-contract"
import type { RepoOperationMode } from "@repo-edu/domain"
import { activeMemberIds, resolveAssignmentGroups } from "@repo-edu/domain"
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
  Tabs,
  TabsList,
  TabsTrigger,
} from "@repo-edu/ui"
import { AlertCircle, Loader2 } from "@repo-edu/ui/components/icons"
import { useCallback, useState } from "react"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import {
  selectAssignments,
  selectGitConnectionName,
  selectRepositoryTemplate,
  selectRoster,
  useCourseStore,
} from "../../stores/course-store.js"
import { useOperationStore } from "../../stores/operation-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"
import {
  buildRepositoryWorkflowRequest,
  type CloneDirectoryLayout,
} from "../../utils/repository-workflow.js"
import { NoCourseEmptyState } from "../NoCourseEmptyState.js"

const LABEL_WIDTH = 100

export function OperationTab() {
  const activeCourseId = useUiStore((s) => s.activeCourseId)
  const course = useCourseStore((s) => s.course)
  const appSettings = useAppSettingsStore((state) => state.settings)
  const roster = useCourseStore(selectRoster)
  const assignments = useCourseStore(selectAssignments)
  const repositoryTemplate = useCourseStore(selectRepositoryTemplate)
  const gitConnectionName = useCourseStore(selectGitConnectionName)
  const setRepositoryTemplate = useCourseStore((s) => s.setRepositoryTemplate)

  const assignmentSelection = useCourseStore((s) => s.assignmentSelection)
  const selectAssignment = useCourseStore((s) => s.setAssignmentSelection)

  const operationSelected = useOperationStore((s) => s.selected)
  const setOperationSelected = useOperationStore((s) => s.setSelected)
  const operationStatus = useOperationStore((s) => s.status)
  const setOperationStatus = useOperationStore((s) => s.setStatus)
  const setOperationError = useOperationStore((s) => s.setError)
  const lastResult = useOperationStore((s) => s.lastResult)
  const setLastResult = useOperationStore((s) => s.setLastResult)

  // Local form state for fields not persisted on course.
  const [targetDirectory, setTargetDirectory] = useState("")
  const [directoryLayout, setDirectoryLayout] =
    useState<CloneDirectoryLayout>("flat")

  // Template fields derive from the course's repositoryTemplate.
  const templateOwner = repositoryTemplate?.owner ?? ""
  const templateVisibility = repositoryTemplate?.visibility ?? "private"

  const setTemplateOwner = useCallback(
    (owner: string) => {
      setRepositoryTemplate({
        owner,
        name: repositoryTemplate?.name ?? "",
        visibility: templateVisibility,
      })
    },
    [repositoryTemplate, templateVisibility, setRepositoryTemplate],
  )

  const selectedAssignment = assignments.find(
    (a) => a.id === assignmentSelection,
  )
  const resolvedGroups =
    selectedAssignment && roster
      ? resolveAssignmentGroups(roster, selectedAssignment)
      : []
  const groupCount = resolvedGroups.length
  const validGroupCount = roster
    ? resolvedGroups.filter(
        (group) => activeMemberIds(roster, group).length > 0,
      ).length
    : 0

  const handleExecute = useCallback(async () => {
    if (!course || !assignmentSelection) {
      return
    }

    setOperationStatus("running")
    setOperationError(null)
    setLastResult(null)

    const { workflowId, input } = buildRepositoryWorkflowRequest({
      course,
      appSettings,
      assignmentId: assignmentSelection,
      operation: operationSelected,
      repositoryTemplate,
      targetDirectory,
      directoryLayout,
    })

    try {
      const client = getWorkflowClient()
      const result = await client.run(workflowId, input)
      setOperationStatus("success")
      setLastResult(result)
    } catch (err) {
      setOperationStatus("error")
      const message = getErrorMessage(err)
      setOperationError(message)
    }
  }, [
    course,
    appSettings,
    assignmentSelection,
    repositoryTemplate,
    operationSelected,
    targetDirectory,
    directoryLayout,
    setOperationStatus,
    setOperationError,
    setLastResult,
  ])

  if (!activeCourseId || !course) {
    return <NoCourseEmptyState tabLabel="repository operations" />
  }

  const isExecuteDisabled =
    !assignmentSelection ||
    validGroupCount === 0 ||
    operationStatus === "running" ||
    !gitConnectionName ||
    (operationSelected === "clone" && !targetDirectory)

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Operation type tabs */}
      <Tabs
        value={operationSelected}
        onValueChange={(v) => setOperationSelected(v as RepoOperationMode)}
      >
        <TabsList className="!pl-0 -ml-2">
          <TabsTrigger value="create" className="justify-start">
            Create Repos
          </TabsTrigger>
          <TabsTrigger value="clone">Clone</TabsTrigger>
          <TabsTrigger value="delete">Delete</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Form fields */}
      <div
        className="grid items-center gap-x-4 gap-y-2"
        style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}
      >
        <Label
          htmlFor="assignment"
          title="Select the assignment to operate on."
        >
          Assignment
        </Label>
        <Select
          value={assignmentSelection ?? ""}
          onValueChange={(v) => selectAssignment(v)}
        >
          <SelectTrigger id="assignment" className="w-80">
            <span className="truncate text-left">
              {selectedAssignment
                ? selectedAssignment.name
                : "Select an assignment"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {assignments.map((a) => (
              <SelectItem key={a.id} value={a.id} className="py-1.5">
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {operationSelected === "create" && (
          <>
            <Label
              htmlFor="templateOwner"
              title="The organization containing template repositories."
            >
              Template Org
            </Label>
            <Input
              id="templateOwner"
              value={templateOwner}
              onChange={(e) => setTemplateOwner(e.target.value)}
              className="w-80"
              placeholder="e.g., my-course-templates"
            />
          </>
        )}

        {operationSelected === "clone" && (
          <>
            <Label
              htmlFor="targetDir"
              title="Local folder where repositories will be cloned."
            >
              Target Folder
            </Label>
            <Input
              id="targetDir"
              value={targetDirectory}
              onChange={(e) => setTargetDirectory(e.target.value)}
              className="w-80"
              placeholder="~/repos/course-2024"
            />
          </>
        )}
      </div>

      {/* Directory layout radio group for clone */}
      {operationSelected === "clone" && (
        <div className="flex items-center gap-4">
          <Label
            className="text-sm font-medium shrink-0"
            style={{ width: LABEL_WIDTH + 20 }}
          >
            Directory Layout
          </Label>
          <RadioGroup
            value={directoryLayout}
            onValueChange={(v) => setDirectoryLayout(v as CloneDirectoryLayout)}
            className="flex gap-4"
          >
            {(
              [
                { value: "flat", label: "Flat" },
                { value: "by-team", label: "By Team" },
                { value: "by-task", label: "By Task" },
              ] as const
            ).map((option) => (
              <Label
                key={option.value}
                htmlFor={`dir-layout-${option.value}`}
                className="flex items-center gap-1.5 text-sm font-normal cursor-pointer"
              >
                <RadioGroupItem
                  value={option.value}
                  id={`dir-layout-${option.value}`}
                />
                {option.label}
              </Label>
            ))}
          </RadioGroup>
        </div>
      )}

      {/* Git connection warning */}
      {!gitConnectionName && (
        <p className="text-sm text-destructive">
          <AlertCircle className="inline-block size-4 mr-1" />
          No Git connection configured for this course.
        </p>
      )}

      {/* Summary and execute */}
      <div className="flex items-center justify-between">
        <div className="text-sm">
          {selectedAssignment ? (
            <>
              {validGroupCount} repositor{validGroupCount === 1 ? "y" : "ies"}{" "}
              will be{" "}
              {operationSelected === "create"
                ? "created"
                : operationSelected === "clone"
                  ? "cloned"
                  : "deleted"}
              {groupCount !== validGroupCount && (
                <span className="ml-2 text-warning">
                  <AlertCircle className="inline-block size-4 mr-1" />
                  {groupCount - validGroupCount} empty group
                  {groupCount - validGroupCount !== 1 ? "s" : ""} will be
                  skipped
                </span>
              )}
            </>
          ) : (
            "Select an assignment to see repository count"
          )}
        </div>
        <Button
          onClick={() => void handleExecute()}
          disabled={isExecuteDisabled}
          variant={operationSelected === "delete" ? "destructive" : "outline"}
          className={operationSelected !== "delete" ? "!text-foreground" : ""}
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

      {/* Error display */}
      {operationStatus === "error" && (
        <p className="text-sm text-destructive">
          {useOperationStore.getState().error}
        </p>
      )}

      {/* Result display */}
      {lastResult && (
        <OperationResultDisplay
          result={lastResult}
          operationType={operationSelected}
        />
      )}
    </div>
  )
}

function OperationResultDisplay({
  result,
  operationType,
}: {
  result: RepositoryBatchResult
  operationType: RepoOperationMode
}) {
  const verb =
    operationType === "create"
      ? "created"
      : operationType === "clone"
        ? "cloned"
        : "deleted"

  return (
    <div className="rounded-md border p-3 text-sm">
      <span className="text-success font-medium">
        {result.repositoriesPlanned} repositor
        {result.repositoriesPlanned === 1 ? "y" : "ies"} {verb}
      </span>
      <span className="ml-2 text-muted-foreground">
        at {new Date(result.completedAt).toLocaleTimeString()}
      </span>
    </div>
  )
}
