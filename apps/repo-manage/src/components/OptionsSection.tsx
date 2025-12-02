import { Button, Label, RadioGroup, RadioGroupItem } from "@repo-edu/ui";
import { MdiLockOutline } from "./icons/MdiLockOutline";
import { MdiLockOpenVariantOutline } from "./icons/MdiLockOpenVariantOutline";
import { useRepoFormStore, useUiStore } from "../stores";
import { Section } from "./Section";
import { FormField } from "./FormField";

export function OptionsSection() {
  const repoForm = useRepoFormStore();
  const ui = useUiStore();

  return (
    <Section
      title="Options"
      locked={ui.optionsLocked}
      lockTooltip="Unlock to change directory layout"
      action={
        <Button size="xs" variant="outline" onClick={() => ui.toggleOptionsLock()}>
          {ui.optionsLocked ? (
            <MdiLockOutline className="h-4 w-4" aria-hidden />
          ) : (
            <MdiLockOpenVariantOutline className="h-4 w-4 text-sky-500" aria-hidden />
          )}
          <span className="sr-only">{ui.optionsLocked ? "Unlock options" : "Lock options"}</span>
        </Button>
      }
    >
      <FormField label="Directory Layout">
        <RadioGroup
          value={repoForm.directoryLayout}
          onValueChange={(v) =>
            repoForm.setField("directoryLayout", v as "by-team" | "flat" | "by-task")
          }
          className="flex gap-4"
          size="xs"
        >
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="flat" id="layout-flat" size="xs" disabled={ui.optionsLocked} />
            <Label htmlFor="layout-flat" size="xs">
              Flat
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem
              value="by-team"
              id="layout-team"
              size="xs"
              disabled={ui.optionsLocked}
            />
            <Label htmlFor="layout-team" size="xs">
              By Team
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem
              value="by-task"
              id="layout-task"
              size="xs"
              disabled={ui.optionsLocked}
            />
            <Label htmlFor="layout-task" size="xs">
              By Task
            </Label>
          </div>
        </RadioGroup>
      </FormField>
    </Section>
  );
}
