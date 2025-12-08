import { Label, RadioGroup, RadioGroupItem } from "@repo-edu/ui"
import { useRepoFormStore } from "../stores"
import { FormField } from "./FormField"
import { Section } from "./Section"

export function OptionsSection() {
  const repoForm = useRepoFormStore()

  return (
    <Section id="options" title="Options">
      <FormField label="Directory Layout">
        <RadioGroup
          value={repoForm.directoryLayout}
          onValueChange={(v) =>
            repoForm.setField(
              "directoryLayout",
              v as "by-team" | "flat" | "by-task",
            )
          }
          className="flex gap-4"
          size="xs"
        >
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="flat" id="layout-flat" size="xs" />
            <Label htmlFor="layout-flat" size="xs">
              Flat
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="by-team" id="layout-team" size="xs" />
            <Label htmlFor="layout-team" size="xs">
              By Team
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="by-task" id="layout-task" size="xs" />
            <Label htmlFor="layout-task" size="xs">
              By Task
            </Label>
          </div>
        </RadioGroup>
      </FormField>
    </Section>
  )
}
