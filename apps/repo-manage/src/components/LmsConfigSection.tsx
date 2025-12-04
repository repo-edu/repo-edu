import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@repo-edu/ui";
import { useLmsFormStore, useUiStore } from "../stores";
import { Section } from "./Section";
import { FormField } from "./FormField";

interface LmsConfigSectionProps {
  onVerify: () => void;
  verifyDisabled?: boolean;
}

export function LmsConfigSection({ onVerify, verifyDisabled }: LmsConfigSectionProps) {
  const lmsForm = useLmsFormStore();
  const ui = useUiStore();

  return (
    <Section
      title="LMS Configuration"
      locked={ui.configLocked}
      lockTooltip="Unlock to edit LMS credentials"
      onToggleLock={() => ui.toggleConfigLock()}
      action={
        <Button size="xs" onClick={onVerify} disabled={verifyDisabled}>
          Verify
        </Button>
      }
    >
      <FormField label="LMS Type" tooltip="Learning Management System type">
        <Select
          value={lmsForm.lmsType}
          onValueChange={(v) => lmsForm.setLmsType(v as "Canvas" | "Moodle")}
          disabled={ui.configLocked}
        >
          <SelectTrigger size="xs" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Canvas" size="xs">
              Canvas
            </SelectItem>
            <SelectItem value="Moodle" size="xs">
              Moodle
            </SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      {lmsForm.lmsType === "Canvas" && (
        <FormField label="Base URL" tooltip="Canvas instance URL">
          <Select
            value={lmsForm.urlOption}
            onValueChange={(v) => lmsForm.setField("urlOption", v as "TUE" | "CUSTOM")}
            disabled={ui.configLocked}
          >
            <SelectTrigger size="xs" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TUE" size="xs">
                TU/e (canvas.tue.nl)
              </SelectItem>
              <SelectItem value="CUSTOM" size="xs">
                Custom URL
              </SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      )}

      {(lmsForm.urlOption === "CUSTOM" || lmsForm.lmsType !== "Canvas") && (
        <FormField label="Custom URL">
          <Input
            size="xs"
            value={lmsForm.customUrl}
            onChange={(e) => lmsForm.setField("customUrl", e.target.value)}
            placeholder="https://..."
            className="flex-1"
            disabled={ui.configLocked}
          />
        </FormField>
      )}

      <FormField label="Access Token" tooltip="API access token from your LMS">
        <div className="flex gap-1 flex-1">
          <Input
            size="xs"
            type={lmsForm.accessToken ? "password" : "text"}
            value={lmsForm.accessToken}
            onChange={(e) => lmsForm.setField("accessToken", e.target.value)}
            placeholder={lmsForm.accessToken ? "••••••••" : "Not set"}
            className={cn("flex-1 password-input", !lmsForm.accessToken && "token-empty")}
            disabled={ui.configLocked}
          />
          <Button
            size="xs"
            variant="outline"
            onClick={() => ui.openLmsTokenDialog(lmsForm.accessToken)}
          >
            Edit
          </Button>
        </div>
      </FormField>

      <FormField
        label="Course ID"
        tooltip="The numeric course ID from your LMS"
      >
        <Input
          size="xs"
          value={lmsForm.courseId}
          onChange={(e) => lmsForm.setField("courseId", e.target.value)}
          placeholder="12345"
          className="flex-1"
          disabled={ui.configLocked}
        />
      </FormField>
    </Section>
  );
}
