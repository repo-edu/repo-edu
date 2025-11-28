import { Button, Input, cn } from "@repo-edu/ui";
import { Lock, LockOpen } from "@repo-edu/ui/components/icons";
import { useRepoFormStore, useUiStore } from "../stores";
import { Section } from "./Section";
import { FormField } from "./FormField";

export function GitConfigSection() {
  const repoForm = useRepoFormStore();
  const ui = useUiStore();

  return (
    <Section title="Git Server Configuration">
      <FormField label="Access Token" tooltip="GitLab/GitHub personal access token">
        <div className="flex gap-1 flex-1">
          <Input
            size="xs"
            type={repoForm.accessToken ? "password" : "text"}
            value={repoForm.accessToken}
            onChange={(e) => repoForm.setField("accessToken", e.target.value)}
            placeholder={repoForm.accessToken ? "••••••••" : "Not set"}
            className={cn("flex-1 password-input", !repoForm.accessToken && "token-empty")}
            disabled={ui.configLocked}
          />
          <Button
            size="xs"
            variant="outline"
            onClick={() => ui.openTokenDialog(repoForm.accessToken)}
          >
            Edit
          </Button>
          <Button size="xs" variant="outline" onClick={() => ui.toggleConfigLock()}>
            {ui.configLocked ? (
              <Lock className="h-4 w-4" aria-hidden />
            ) : (
              <LockOpen className="h-4 w-4 text-sky-500" aria-hidden />
            )}
            <span className="sr-only">
              {ui.configLocked ? "Lock settings" : "Unlock settings"}
            </span>
          </Button>
        </div>
      </FormField>

      <FormField label="User" tooltip="Your Git username">
        <Input
          size="xs"
          value={repoForm.user}
          onChange={(e) => repoForm.setField("user", e.target.value)}
          placeholder="username"
          className="flex-1"
          disabled={ui.configLocked}
        />
      </FormField>

      <FormField label="Base URL" tooltip="Git server base URL">
        <Input
          size="xs"
          value={repoForm.baseUrl}
          onChange={(e) => repoForm.setField("baseUrl", e.target.value)}
          placeholder="https://gitlab.tue.nl"
          className="flex-1"
          disabled={ui.configLocked}
        />
      </FormField>

      <FormField label="Student Repos Group" tooltip="Group path for student repositories">
        <Input
          size="xs"
          value={repoForm.studentReposGroup}
          onChange={(e) => repoForm.setField("studentReposGroup", e.target.value)}
          placeholder="course/student-repos"
          className="flex-1"
          disabled={ui.configLocked}
        />
      </FormField>

      <FormField label="Template Group" tooltip="Group path containing template repositories">
        <Input
          size="xs"
          value={repoForm.templateGroup}
          onChange={(e) => repoForm.setField("templateGroup", e.target.value)}
          placeholder="course/templates"
          className="flex-1"
          disabled={ui.configLocked}
        />
      </FormField>
    </Section>
  );
}
