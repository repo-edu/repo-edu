import type { RosterMember } from "@repo-edu/domain";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui";
import { EllipsisVertical, Trash2 } from "@repo-edu/ui/components/icons";
import type { EditableGroupTarget } from "../../../stores/profile-store.js";

type MemberChipProps = {
  member: RosterMember;
  isStaff: boolean;
  sourceGroupId: string;
  sourceGroupEditable: boolean;
  editableTargets: EditableGroupTarget[];
  memberGroupIds: Set<string>;
  onRemove?: () => void;
  onMove?: (targetGroupId: string) => void;
  onCopy?: (targetGroupId: string) => void;
};

function buildTargets(
  editableTargets: EditableGroupTarget[],
  sourceGroupId: string,
  memberGroupIds: Set<string>,
) {
  return editableTargets
    .map((gs) => ({
      ...gs,
      groups: gs.groups.filter(
        (g) => g.id !== sourceGroupId && !memberGroupIds.has(g.id),
      ),
    }))
    .filter((gs) => gs.groups.length > 0);
}

export function MemberChip({
  member,
  isStaff,
  sourceGroupId,
  sourceGroupEditable,
  editableTargets,
  memberGroupIds,
  onRemove,
  onMove,
  onCopy,
}: MemberChipProps) {
  const targets = buildTargets(editableTargets, sourceGroupId, memberGroupIds);
  const hasMove = sourceGroupEditable && targets.length > 0;
  const hasCopy = targets.length > 0;
  const hasRemove = !!onRemove;
  const hasActions = hasCopy || hasMove || hasRemove;

  const chip = (
    <span className="inline-flex items-center rounded-full pl-2 pr-1 py-0.5 text-xs bg-muted text-muted-foreground">
      <span>{member.name}</span>
      {hasActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-foreground/10"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Actions for ${member.name}`}
            >
              <EllipsisVertical className="size-2.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {hasCopy && targets.length > 0 && (
              <>
                <DropdownMenuLabel className="text-xs">
                  Copy to group
                </DropdownMenuLabel>
                {targets.map((gs) => (
                  <DropdownMenuSub key={gs.groupSetId}>
                    <DropdownMenuSubTrigger className="text-xs">
                      {gs.groupSetName}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {gs.groups.map((g) => (
                        <DropdownMenuItem
                          key={g.id}
                          className="text-xs"
                          onSelect={() => onCopy?.(g.id)}
                        >
                          {g.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))}
              </>
            )}
            {hasMove && targets.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">
                  Move to group
                </DropdownMenuLabel>
                {targets.map((gs) => (
                  <DropdownMenuSub key={gs.groupSetId}>
                    <DropdownMenuSubTrigger className="text-xs">
                      {gs.groupSetName}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {gs.groups.map((g) => (
                        <DropdownMenuItem
                          key={g.id}
                          className="text-xs"
                          onSelect={() => onMove?.(g.id)}
                        >
                          {g.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))}
              </>
            )}
            {hasRemove && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs text-destructive"
                  onSelect={onRemove}
                >
                  <Trash2 className="size-3 mr-1.5" />
                  Remove from group
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </span>
  );

  if (!isStaff) return chip;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Non-student role
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
