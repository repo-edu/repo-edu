import { Input, Checkbox, Label } from "@repo-edu/ui";
import { useLmsFormStore } from "../stores";
import { Section } from "./Section";
import { FormField } from "./FormField";
import { FilePathInput } from "./FilePathInput";

interface OutputConfigSectionProps {
  onBrowseFolder: (setter: (path: string) => void) => void;
}

export function OutputConfigSection({ onBrowseFolder }: OutputConfigSectionProps) {
  const lmsForm = useLmsFormStore();

  return (
    <Section title="Output Configuration">
      <FormField label="Info File Folder">
        <FilePathInput
          value={lmsForm.infoFileFolder}
          onChange={(v) => lmsForm.setField("infoFileFolder", v)}
          placeholder="Output folder for generated files"
          onBrowse={() => onBrowseFolder((p) => lmsForm.setField("infoFileFolder", p))}
        />
      </FormField>

      <FormField label="YAML File">
        <Input
          size="xs"
          value={lmsForm.yamlFile}
          onChange={(e) => lmsForm.setField("yamlFile", e.target.value)}
          placeholder="students.yaml"
          className="flex-1"
        />
      </FormField>

      <div className="flex items-center gap-4 ml-28">
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="output-yaml"
            checked={lmsForm.yaml}
            onCheckedChange={(c) => lmsForm.setField("yaml", c === true)}
            size="xs"
          />
          <Label htmlFor="output-yaml" size="xs">
            YAML
          </Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="output-csv"
            checked={lmsForm.csv}
            onCheckedChange={(c) => lmsForm.setField("csv", c === true)}
            size="xs"
          />
          <Label htmlFor="output-csv" size="xs">
            CSV
          </Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="output-xlsx"
            checked={lmsForm.xlsx}
            onCheckedChange={(c) => lmsForm.setField("xlsx", c === true)}
            size="xs"
          />
          <Label htmlFor="output-xlsx" size="xs">
            XLSX
          </Label>
        </div>
      </div>
    </Section>
  );
}
