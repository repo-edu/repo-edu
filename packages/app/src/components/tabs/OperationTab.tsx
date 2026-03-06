import { useState, useCallback } from "react";
import type {
  RepoOperationMode,
} from "@repo-edu/domain";
import {
  resolveAssignmentGroups,
  activeMemberIds,
} from "@repo-edu/domain";
import type { RepositoryBatchResult } from "@repo-edu/application-contract";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  RadioGroup,
  RadioGroupItem,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@repo-edu/ui";
import {
  AlertCircle,
  Loader2,
} from "@repo-edu/ui/components/icons";
import { NoProfileEmptyState } from "../NoProfileEmptyState.js";
import { useProfileStore, selectAssignments, selectRoster, selectRepositoryTemplate, selectGitConnectionName } from "../../stores/profile-store.js";
import { useOperationStore } from "../../stores/operation-store.js";
import { useUiStore } from "../../stores/ui-store.js";
import { useToastStore } from "../../stores/toast-store.js";
import { getWorkflowClient } from "../../contexts/workflow-client.js";
import { getErrorMessage } from "../../utils/error-message.js";
import {
  buildRepositoryWorkflowRequest,
  type CloneDirectoryLayout,
} from "../../utils/repository-workflow.js";

const LABEL_WIDTH = 100;

export function OperationTab() {
  const activeProfileId = useUiStore((s) => s.activeProfileId);
  const profile = useProfileStore((s) => s.profile);
  const roster = useProfileStore(selectRoster);
  const assignments = useProfileStore(selectAssignments);
  const repositoryTemplate = useProfileStore(selectRepositoryTemplate);
  const gitConnectionName = useProfileStore(selectGitConnectionName);
  const setRepositoryTemplate = useProfileStore(
    (s) => s.setRepositoryTemplate,
  );

  const assignmentSelection = useProfileStore((s) => s.assignmentSelection);
  const selectAssignment = useProfileStore((s) => s.setAssignmentSelection);

  const operationSelected = useOperationStore((s) => s.selected);
  const setOperationSelected = useOperationStore((s) => s.setSelected);
  const operationStatus = useOperationStore((s) => s.status);
  const setOperationStatus = useOperationStore((s) => s.setStatus);
  const setOperationError = useOperationStore((s) => s.setError);
  const lastResult = useOperationStore((s) => s.lastResult);
  const setLastResult = useOperationStore((s) => s.setLastResult);

  const addToast = useToastStore((s) => s.addToast);

  // Local form state for fields not persisted on profile.
  const [targetDirectory, setTargetDirectory] = useState("");
  const [directoryLayout, setDirectoryLayout] =
    useState<CloneDirectoryLayout>("flat");

  // Template fields derive from the profile's repositoryTemplate.
  const templateOwner = repositoryTemplate?.owner ?? "";
  const templateVisibility = repositoryTemplate?.visibility ?? "private";

  const setTemplateOwner = useCallback(
    (owner: string) => {
      setRepositoryTemplate({
        owner,
        name: repositoryTemplate?.name ?? "",
        visibility: templateVisibility,
      });
    },
    [repositoryTemplate, templateVisibility, setRepositoryTemplate],
  );

  const selectedAssignment = assignments.find(
    (a) => a.id === assignmentSelection,
  );
  const resolvedGroups =
    selectedAssignment && roster
      ? resolveAssignmentGroups(roster, selectedAssignment)
      : [];
  const groupCount = resolvedGroups.length;
  const validGroupCount = roster
    ? resolvedGroups.filter(
        (group) => activeMemberIds(roster, group).length > 0,
      ).length
    : 0;

  const handleExecute = useCallback(async () => {
    if (!activeProfileId || !assignmentSelection) {
      return;
    }

    setOperationStatus("running");
    setOperationError(null);
    setLastResult(null);

    const { workflowId, input } = buildRepositoryWorkflowRequest({
      activeProfileId,
      assignmentId: assignmentSelection,
      operation: operationSelected,
      repositoryTemplate,
      targetDirectory,
      directoryLayout,
    });

    try {
      const client = getWorkflowClient();
      const result = await client.run(workflowId, input);
      setOperationStatus("success");
      setLastResult(result);
    } catch (err) {
      setOperationStatus("error");
      const message = getErrorMessage(err);
      setOperationError(message);
      addToast(message, { tone: "error" });
    }
  }, [
    activeProfileId,
    assignmentSelection,
    repositoryTemplate,
    operationSelected,
    targetDirectory,
    directoryLayout,
    setOperationStatus,
    setOperationError,
    setLastResult,
    addToast,
  ]);

  if (!activeProfileId || !profile) {
    return <NoProfileEmptyState tabLabel="repository operations" />;
  }

  const isExecuteDisabled =
    !assignmentSelection ||
    validGroupCount === 0 ||
    operationStatus === "running" ||
    !gitConnectionName ||
    (operationSelected === "clone" && !targetDirectory);

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
              <label
                key={option.value}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
              >
                <RadioGroupItem value={option.value} />
                {option.label}
              </label>
            ))}
          </RadioGroup>
        </div>
      )}

      {/* Git connection warning */}
      {!gitConnectionName && (
        <p className="text-sm text-destructive">
          <AlertCircle className="inline-block size-4 mr-1" />
          No Git connection configured for this profile.
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
  );
}

function OperationResultDisplay({
  result,
  operationType,
}: {
  result: RepositoryBatchResult;
  operationType: RepoOperationMode;
}) {
  const verb =
    operationType === "create"
      ? "created"
      : operationType === "clone"
        ? "cloned"
        : "deleted";

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
  );
}
