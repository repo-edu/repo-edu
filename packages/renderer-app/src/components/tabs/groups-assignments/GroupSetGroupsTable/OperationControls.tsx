import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@repo-edu/ui"
import { ChevronDown } from "@repo-edu/ui/components/icons"
import { useUiStore } from "../../../../stores/ui-store.js"
import type {
  OperationModeKey,
  RepositoryOperationMode,
} from "../../../../utils/repository-workflow.js"
import { CloneAllRepositoriesPanel } from "./CloneAllRepositoriesPanel.js"
import {
  operationModeLabels,
  operationModeOrder,
  operationModeTooltip,
  selectedOutlineButtonClass,
} from "./operation-mode-copy.js"
import { formatOperationResult } from "./operation-result-format.js"
import {
  type RepoOperations,
  RepositoryOperationFields,
  SharedRepositoryFields,
} from "./repository-operation-fields.js"
import { useRepoOperations } from "./use-repo-operations.js"

type OperationControlsProps = {
  readonly groupSetId: string
  readonly disabled: boolean
  readonly effectiveAssignmentId: string | null
  readonly nonEmptyCount: number
  readonly emptyCount: number
}

export function OperationControls({
  groupSetId,
  disabled,
  effectiveAssignmentId,
  nonEmptyCount,
  emptyCount,
}: OperationControlsProps) {
  const operations = useRepoOperations({
    effectiveAssignmentId,
    nonEmptyCount,
    emptyCount,
    disabled,
  })
  const openSection = useUiStore(
    (state) => state.groupOperationSectionByGroupSet[groupSetId] ?? null,
  )
  const setGroupOperationSection = useUiStore(
    (state) => state.setGroupOperationSection,
  )

  const toggleSection = (section: OperationModeKey) => {
    setGroupOperationSection(
      groupSetId,
      openSection === section ? null : section,
    )
  }

  return (
    <div className="px-3 py-2 space-y-2 border-b">
      <div className="flex items-center gap-2">
        {operationModeOrder.map((section) => (
          <ModeButton
            key={section}
            label={operationModeLabels[section]}
            tooltip={operationModeTooltip(
              section,
              operations.activeGitConnection?.provider,
            )}
            active={openSection === section}
            disabled={disabled}
            onClick={() => toggleSection(section)}
          />
        ))}
      </div>

      {openSection !== null && (
        <OperationPanel
          operation={openSection}
          groupSetId={groupSetId}
          operations={operations}
          nonEmptyCount={nonEmptyCount}
          emptyCount={emptyCount}
        />
      )}

      {operations.operationError && (
        <p className="text-sm text-destructive">{operations.operationError}</p>
      )}
      {operations.lastResult && (
        <p className="text-sm text-muted-foreground">
          {formatOperationResult(operations.lastResult)}
        </p>
      )}
    </div>
  )
}

type ModeButtonProps = {
  readonly label: string
  readonly tooltip: string
  readonly active: boolean
  readonly disabled: boolean
  readonly onClick: () => void
}

function ModeButton({
  label,
  tooltip,
  active,
  disabled,
  onClick,
}: ModeButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={active ? selectedOutlineButtonClass : ""}
          disabled={disabled}
          onClick={onClick}
        >
          {label}
          <ChevronDown
            className={`ml-1 size-4 transition-transform ${
              active ? "rotate-180" : ""
            }`}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

type OperationPanelProps = {
  readonly operation: OperationModeKey
  readonly groupSetId: string
  readonly operations: RepoOperations
  readonly nonEmptyCount: number
  readonly emptyCount: number
}

function OperationPanel({
  operation,
  groupSetId,
  operations,
  nonEmptyCount,
  emptyCount,
}: OperationPanelProps) {
  return (
    <div className="border rounded-md p-3 space-y-3">
      <SharedRepositoryFields groupSetId={groupSetId} operations={operations} />
      {operation === "clone-all" ? (
        <CloneAllRepositoriesPanel operations={operations} />
      ) : (
        <RepositoryOperationFields
          operation={operation as RepositoryOperationMode}
          operations={operations}
          nonEmptyCount={nonEmptyCount}
          emptyCount={emptyCount}
        />
      )}
    </div>
  )
}
