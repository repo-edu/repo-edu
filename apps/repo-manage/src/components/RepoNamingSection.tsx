import {
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { useLmsFormStore } from "../stores"
import { FormField } from "./FormField"
import { Section } from "./Section"

export function RepoNamingSection() {
  const lmsForm = useLmsFormStore()

  return (
    <Section title="Repository Naming">
      <FormField
        label="Include"
        tooltip="Components to include in repository names"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="include-group"
              checked={lmsForm.includeGroup}
              onCheckedChange={(c) =>
                lmsForm.setField("includeGroup", c === true)
              }
              size="xs"
            />
            <Label htmlFor="include-group" size="xs">
              Group name
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="include-member"
              checked={lmsForm.includeMember}
              onCheckedChange={(c) =>
                lmsForm.setField("includeMember", c === true)
              }
              size="xs"
            />
            <Label htmlFor="include-member" size="xs">
              Member names
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="include-initials"
              checked={lmsForm.includeInitials}
              onCheckedChange={(c) =>
                lmsForm.setField("includeInitials", c === true)
              }
              size="xs"
            />
            <Label htmlFor="include-initials" size="xs">
              Initials
            </Label>
          </div>
        </div>
      </FormField>

      <FormField
        label="Member Format"
        tooltip="How member info is formatted in output"
      >
        <Select
          value={lmsForm.memberOption}
          onValueChange={(v) =>
            lmsForm.setField(
              "memberOption",
              v as "(email, gitid)" | "email" | "git_id",
            )
          }
        >
          <SelectTrigger size="xs" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="(email, gitid)" size="xs">
              (email, gitid)
            </SelectItem>
            <SelectItem value="email" size="xs">
              email
            </SelectItem>
            <SelectItem value="git_id" size="xs">
              git_id
            </SelectItem>
          </SelectContent>
        </Select>
      </FormField>
    </Section>
  )
}
