import type { AnalysisBlameConfig } from "@repo-edu/domain/analysis"
import type { AnalysisInputs } from "@repo-edu/domain/types"
import { Checkbox, Input, Label, Text } from "@repo-edu/ui"
import { ExtensionTagInput } from "../../settings/ExtensionTagInput.js"
import {
  type AnalysisSidebarSectionKey,
  CollapsibleSection,
} from "./AnalysisSidebarSection.js"

const COPY_MOVE_LABELS: Record<number, string> = {
  0: "None",
  1: "Within file (-M)",
  2: "Across files (-C)",
  3: "Across commits (-C -C)",
  4: "All commits (-C -C -C)",
}

/** The message of the last refused edit, kept beside the field it refused. */
export type AnalysisInputIssues = Partial<Record<keyof AnalysisInputs, string>>

type SidebarInputControls = {
  config: AnalysisInputs
  configInputResetKey: string
  setConfigAndRerun: (patch: Partial<AnalysisInputs>) => void
  inputIssues: AnalysisInputIssues
  blurOnEnter: (event: React.KeyboardEvent<HTMLInputElement>) => void
}

type SidebarInputSectionProps = SidebarInputControls & {
  sections: Record<AnalysisSidebarSectionKey, boolean>
  onOpenChange: (key: AnalysisSidebarSectionKey, open: boolean) => void
}

function FieldIssue({ message }: { message: string | undefined }) {
  if (message === undefined) return null
  return <Text className="text-xs text-destructive">{message}</Text>
}

export function AnalysisSidebarInputSections({
  sections,
  onOpenChange,
  config,
  configInputResetKey,
  setConfigAndRerun,
  inputIssues,
  blurOnEnter,
  blameConfig,
  copyMoveDraft,
  setCopyMoveDraft,
  commitCopyMoveDraft,
}: SidebarInputSectionProps & {
  blameConfig: AnalysisBlameConfig
  copyMoveDraft: string | null
  setCopyMoveDraft: (value: string | null) => void
  commitCopyMoveDraft: () => void
}) {
  const blameSkip = config.blameSkip ?? false

  return (
    <>
      <FileSelectionSection
        open={sections.fileSelection}
        onOpenChange={onOpenChange}
        config={config}
        configInputResetKey={configInputResetKey}
        setConfigAndRerun={setConfigAndRerun}
        inputIssues={inputIssues}
        blurOnEnter={blurOnEnter}
      />
      <DateRangeSection
        open={sections.dateRange}
        onOpenChange={onOpenChange}
        config={config}
        configInputResetKey={configInputResetKey}
        setConfigAndRerun={setConfigAndRerun}
        inputIssues={inputIssues}
        blurOnEnter={blurOnEnter}
      />
      <CollapsibleSection
        title="Blame"
        sectionKey="blame"
        open={sections.blame}
        onOpenChange={onOpenChange}
        showSeparator
      >
        <div className="flex items-center gap-2">
          <Checkbox
            id="blameSkip"
            checked={blameSkip}
            onCheckedChange={(checked) =>
              setConfigAndRerun({ blameSkip: checked === true })
            }
          />
          <Label htmlFor="blameSkip" className="text-xs">
            Skip blame analysis
          </Label>
        </div>

        {!blameSkip && (
          <div className="space-y-2 pt-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Copy/Move</Label>
                <Input
                  type="number"
                  size="xs"
                  min={0}
                  max={4}
                  step={1}
                  className="w-12"
                  value={copyMoveDraft ?? String(blameConfig.copyMove ?? 1)}
                  onChange={(event) => setCopyMoveDraft(event.target.value)}
                  onBlur={commitCopyMoveDraft}
                  onKeyDown={blurOnEnter}
                />
              </div>
              <Text className="text-xs text-muted-foreground">
                {COPY_MOVE_LABELS[blameConfig.copyMove ?? 1]}
              </Text>
            </div>
          </div>
        )}
      </CollapsibleSection>
      <CollapsibleSection
        title="Options"
        sectionKey="options"
        open={sections.options}
        onOpenChange={onOpenChange}
        showSeparator
      >
        <div className="flex items-center gap-2">
          <Checkbox
            id="whitespace"
            checked={config.whitespace ?? false}
            onCheckedChange={(checked) =>
              setConfigAndRerun({ whitespace: checked === true })
            }
          />
          <Label htmlFor="whitespace" className="text-xs">
            Include whitespace changes
          </Label>
        </div>
      </CollapsibleSection>
      <ExclusionsSection
        open={sections.exclusions}
        onOpenChange={onOpenChange}
        config={config}
        configInputResetKey={configInputResetKey}
        setConfigAndRerun={setConfigAndRerun}
        inputIssues={inputIssues}
        blurOnEnter={blurOnEnter}
      />
    </>
  )
}

function FileSelectionSection({
  open,
  onOpenChange,
  config,
  configInputResetKey,
  setConfigAndRerun,
  inputIssues,
  blurOnEnter,
}: SidebarInputControls & {
  open: boolean
  onOpenChange: (key: AnalysisSidebarSectionKey, open: boolean) => void
}) {
  return (
    <CollapsibleSection
      title="File Selection"
      sectionKey="fileSelection"
      open={open}
      onOpenChange={onOpenChange}
      showSeparator
    >
      <div className="space-y-1">
        <Label className="text-xs">Subfolder</Label>
        <Input
          key={`subfolder-${configInputResetKey}`}
          type="text"
          size="xs"
          placeholder="src/"
          defaultValue={config.subfolder ?? ""}
          aria-invalid={inputIssues.subfolder !== undefined || undefined}
          onBlur={(event) =>
            setConfigAndRerun({ subfolder: event.target.value || undefined })
          }
          onKeyDown={blurOnEnter}
        />
        <FieldIssue message={inputIssues.subfolder} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">File patterns</Label>
        <Input
          key={`include-files-${configInputResetKey}`}
          type="text"
          size="xs"
          placeholder="*.ts"
          defaultValue={config.includeFiles?.join(", ") ?? ""}
          aria-invalid={inputIssues.includeFiles !== undefined || undefined}
          onBlur={(event) => {
            const raw = event.target.value
            setConfigAndRerun({
              includeFiles: raw
                ? raw
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean)
                : undefined,
            })
          }}
          onKeyDown={blurOnEnter}
        />
        <FieldIssue message={inputIssues.includeFiles} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Extensions</Label>
        <ExtensionTagInput
          size="xs"
          values={config.extensions ?? []}
          onChange={(next) =>
            setConfigAndRerun({
              extensions: next.length === 0 ? undefined : next,
            })
          }
          placeholder="ts, tsx, js"
          ariaLabel="Extensions"
        />
        <FieldIssue message={inputIssues.extensions} />
      </div>
    </CollapsibleSection>
  )
}

function DateRangeSection({
  open,
  onOpenChange,
  config,
  configInputResetKey,
  setConfigAndRerun,
  inputIssues,
  blurOnEnter,
}: SidebarInputControls & {
  open: boolean
  onOpenChange: (key: AnalysisSidebarSectionKey, open: boolean) => void
}) {
  return (
    <CollapsibleSection
      title="Date Range"
      sectionKey="dateRange"
      open={open}
      onOpenChange={onOpenChange}
      showSeparator
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Since</Label>
          <Input
            key={`since-${configInputResetKey}`}
            type="text"
            size="xs"
            placeholder="YYYY-MM-DD"
            defaultValue={config.since ?? ""}
            aria-invalid={inputIssues.since !== undefined || undefined}
            onBlur={(event) =>
              setConfigAndRerun({ since: event.target.value || undefined })
            }
            onKeyDown={blurOnEnter}
          />
          <FieldIssue message={inputIssues.since} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Until</Label>
          <Input
            key={`until-${configInputResetKey}`}
            type="text"
            size="xs"
            placeholder="YYYY-MM-DD"
            defaultValue={config.until ?? ""}
            aria-invalid={inputIssues.until !== undefined || undefined}
            onBlur={(event) =>
              setConfigAndRerun({ until: event.target.value || undefined })
            }
            onKeyDown={blurOnEnter}
          />
          <FieldIssue message={inputIssues.until} />
        </div>
      </div>
    </CollapsibleSection>
  )
}

function ExclusionsSection({
  open,
  onOpenChange,
  config,
  configInputResetKey,
  setConfigAndRerun,
  inputIssues,
  blurOnEnter,
}: SidebarInputControls & {
  open: boolean
  onOpenChange: (key: AnalysisSidebarSectionKey, open: boolean) => void
}) {
  return (
    <CollapsibleSection
      title="Exclusions"
      sectionKey="exclusions"
      open={open}
      onOpenChange={onOpenChange}
      showSeparator
    >
      <CommaListInput
        label="Files"
        inputKey={`exclude-files-${configInputResetKey}`}
        placeholder="*.test.ts"
        value={config.excludeFiles}
        issue={inputIssues.excludeFiles}
        onChange={(excludeFiles) => setConfigAndRerun({ excludeFiles })}
        onKeyDown={blurOnEnter}
      />
      <CommaListInput
        label="Authors"
        inputKey={`exclude-authors-${configInputResetKey}`}
        placeholder="bot*"
        value={config.excludeAuthors}
        issue={inputIssues.excludeAuthors}
        onChange={(excludeAuthors) => setConfigAndRerun({ excludeAuthors })}
        onKeyDown={blurOnEnter}
      />
      <CommaListInput
        label="Emails"
        inputKey={`exclude-emails-${configInputResetKey}`}
        placeholder="noreply@*"
        value={config.excludeEmails}
        issue={inputIssues.excludeEmails}
        onChange={(excludeEmails) => setConfigAndRerun({ excludeEmails })}
        onKeyDown={blurOnEnter}
      />
      <CommaListInput
        label="Revisions"
        inputKey={`exclude-revisions-${configInputResetKey}`}
        placeholder="abc1234"
        value={config.excludeRevisions}
        issue={inputIssues.excludeRevisions}
        onChange={(excludeRevisions) => setConfigAndRerun({ excludeRevisions })}
        onKeyDown={blurOnEnter}
      />
      <CommaListInput
        label="Messages"
        inputKey={`exclude-messages-${configInputResetKey}`}
        placeholder="merge*"
        value={config.excludeMessages}
        issue={inputIssues.excludeMessages}
        onChange={(excludeMessages) => setConfigAndRerun({ excludeMessages })}
        onKeyDown={blurOnEnter}
      />
    </CollapsibleSection>
  )
}

function CommaListInput({
  label,
  inputKey,
  placeholder,
  value,
  issue,
  onChange,
  onKeyDown,
}: {
  label: string
  inputKey: string
  placeholder: string
  value: string[] | undefined
  issue: string | undefined
  onChange: (value: string[] | undefined) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        key={inputKey}
        type="text"
        size="xs"
        placeholder={placeholder}
        defaultValue={value?.join(", ") ?? ""}
        aria-invalid={issue !== undefined || undefined}
        onBlur={(event) => {
          const raw = event.target.value
          onChange(
            raw
              ? raw
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              : undefined,
          )
        }}
        onKeyDown={onKeyDown}
      />
      <FieldIssue message={issue} />
    </div>
  )
}
