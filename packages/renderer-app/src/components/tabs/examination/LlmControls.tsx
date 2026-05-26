import type { PersistedLlmConnection } from "@repo-edu/domain/settings"
import {
  listCatalogSpecsForProvider,
  modelCode,
} from "@repo-edu/integrations-llm-catalog"
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { useMemo } from "react"
import { formatSpecLabel, PROVIDER_LABEL } from "./llm-models.js"

type LlmControlsProps = {
  connections: PersistedLlmConnection[]
  activeConnection: PersistedLlmConnection | null
  selectedModelCode: string | null
  onSelectConnection: (id: string) => void
  onSelectModelCode: (code: string) => void
  onOpenSettings: () => void
}

export function LlmControls({
  connections,
  activeConnection,
  selectedModelCode,
  onSelectConnection,
  onSelectModelCode,
  onOpenSettings,
}: LlmControlsProps) {
  const provider = activeConnection?.provider ?? null
  const providerSpecs = useMemo(
    () => (provider === null ? [] : listCatalogSpecsForProvider(provider)),
    [provider],
  )

  if (connections.length === 0) {
    return (
      <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        No LLM connection configured.{" "}
        <button type="button" className="underline" onClick={onOpenSettings}>
          Add one in Settings
        </button>{" "}
        to generate questions.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="examination-llm-connection">LLM connection</Label>
        <Select
          value={activeConnection?.id ?? ""}
          onValueChange={onSelectConnection}
        >
          <SelectTrigger id="examination-llm-connection" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {connections.map((connection) => {
              const trimmedName = connection.name.trim()
              const label = trimmedName
                ? `${trimmedName} · ${PROVIDER_LABEL[connection.provider]}`
                : PROVIDER_LABEL[connection.provider]
              return (
                <SelectItem key={connection.id} value={connection.id}>
                  {label}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="examination-llm-model">Model</Label>
        <Select
          value={selectedModelCode ?? ""}
          onValueChange={onSelectModelCode}
          disabled={provider === null || providerSpecs.length === 0}
        >
          <SelectTrigger id="examination-llm-model" className="w-56">
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectContent>
            {providerSpecs.map((spec) => {
              const code = modelCode(spec)
              return (
                <SelectItem key={code} value={code}>
                  {formatSpecLabel(spec)}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
