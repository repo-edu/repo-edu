import { useCallback, useState } from "react"
import {
  type DocsFixturePreset,
  type DocsFixtureTier,
  docsFixturePresets,
  docsFixtureTiers,
  resolveDocsFixtureSelection,
} from "../fixtures/docs-fixtures.js"

const tierDescriptions: Record<DocsFixtureTier, string> = {
  small: "24 students, 2 staff",
  medium: "72 students, 4 staff",
  stress: "180 students, 8 staff",
}

const presetDescriptions: Record<DocsFixturePreset, string> = {
  "shared-teams": "grp01 … grpN — same groups across assignments",
  "assignment-scoped": "a1-grp01 … a2-grp01 … — separate groups per assignment",
}

function updateParentQuery(tier: DocsFixtureTier, preset: DocsFixturePreset) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.set("tier", tier)
  url.searchParams.set("preset", preset)
  window.history.replaceState(null, "", url)
}

function buildIframeSrc(tier: DocsFixtureTier, preset: DocsFixturePreset) {
  return `/demo-standalone?tier=${tier}&preset=${preset}`
}

export default function DemoShell() {
  const [selection, setSelection] = useState(() =>
    resolveDocsFixtureSelection(),
  )

  const onTierChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const tier = event.currentTarget.value as DocsFixtureTier
      setSelection((prev) => {
        updateParentQuery(tier, prev.preset)
        return { ...prev, tier }
      })
    },
    [],
  )

  const onPresetChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const preset = event.currentTarget.value as DocsFixturePreset
      setSelection((prev) => {
        updateParentQuery(prev.tier, preset)
        return { ...prev, preset }
      })
    },
    [],
  )

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <div style={styles.field}>
          <label style={styles.fieldLabel} htmlFor="demo-tier">
            Cohort size
          </label>
          <select
            id="demo-tier"
            value={selection.tier}
            onChange={onTierChange}
            style={styles.select}
          >
            {docsFixtureTiers.map((tier) => (
              <option key={tier} value={tier}>
                {tier} — {tierDescriptions[tier]}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.separator} />
        <div style={styles.field}>
          <label style={styles.fieldLabel} htmlFor="demo-preset">
            Group layout
          </label>
          <select
            id="demo-preset"
            value={selection.preset}
            onChange={onPresetChange}
            style={styles.select}
          >
            {docsFixturePresets.map((preset) => (
              <option key={preset} value={preset}>
                {presetDescriptions[preset]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <iframe
        src={buildIframeSrc(selection.tier, selection.preset)}
        style={styles.iframe}
        title="repo-edu interactive demo"
      />
    </div>
  )
}

const styles = {
  root: {
    position: "relative" as const,
    left: "50%",
    transform: "translateX(-50%)",
    width: "95vw",
    maxWidth: 1600,
    minHeight: 600,
    height: "calc((100vh - var(--sl-nav-height, 3.5rem)) * 0.90)",
    border: "1px solid #4b5563",
    borderRadius: 8,
    overflow: "hidden",
    background: "#18181b",
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    display: "flex",
    flexDirection: "column" as const,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "8px 14px",
    borderBottom: "1px solid #374151",
    background: "#1f1f23",
    flexShrink: 0,
  },
  field: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    whiteSpace: "nowrap" as const,
  },
  separator: {
    width: 1,
    height: 20,
    background: "#374151",
    flexShrink: 0,
  },
  select: {
    fontSize: 13,
    padding: "4px 8px",
    borderRadius: 4,
    border: "1px solid #4b5563",
    background: "#27272a",
    color: "#f3f4f6",
    cursor: "pointer",
  },
  iframe: {
    flex: 1,
    width: "100%",
    border: "none",
  },
}
