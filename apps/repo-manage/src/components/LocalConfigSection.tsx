import { Input } from "@repo-edu/ui";
import { useRepoFormStore } from "../stores";
import { Section } from "./Section";
import { FormField } from "./FormField";
import { FilePathInput } from "./FilePathInput";

interface LocalConfigSectionProps {
  onBrowseFile: (setter: (path: string) => void) => void;
  onBrowseFolder: (setter: (path: string) => void) => void;
}

export function LocalConfigSection({ onBrowseFile, onBrowseFolder }: LocalConfigSectionProps) {
  const repoForm = useRepoFormStore();

  return (
    <Section title="Local Configuration">
      <FormField label="YAML File" tooltip="Path to students YAML file">
        <FilePathInput
          value={repoForm.yamlFile}
          onChange={(v) => repoForm.setField("yamlFile", v)}
          placeholder="students.yaml"
          onBrowse={() => onBrowseFile((p) => repoForm.setField("yamlFile", p))}
        />
      </FormField>

      <FormField label="Target Folder" tooltip="Folder for cloned repositories">
        <FilePathInput
          value={repoForm.targetFolder}
          onChange={(v) => repoForm.setField("targetFolder", v)}
          placeholder="/path/to/repos"
          onBrowse={() => onBrowseFolder((p) => repoForm.setField("targetFolder", p))}
        />
      </FormField>

      <FormField label="Assignments" tooltip="Comma-separated list of assignments">
        <Input
          size="xs"
          value={repoForm.assignments}
          onChange={(e) => repoForm.setField("assignments", e.target.value)}
          placeholder="assignment1, assignment2"
          className="flex-1"
        />
      </FormField>
    </Section>
  );
}
