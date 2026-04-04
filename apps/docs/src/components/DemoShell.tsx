import { useCallback, useState } from "react"
import {
  type DocsFixtureSource,
  docsFixtureSources,
  resolveDocsFixtureSelection,
} from "../fixtures/docs-fixtures.js"

const sourceDescriptions: Record<DocsFixtureSource, string> = {
  canvas: "Canvas LMS — synced roster and groups",
  moodle: "Moodle LMS — synced roster and groupings",
  file: "RepoBee teams.txt import — no LMS connection",
}

const docsBasePath = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL.slice(0, -1)
  : import.meta.env.BASE_URL

function updateParentQuery(source: DocsFixtureSource) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.set("source", source)
  url.searchParams.delete("tier")
  window.history.replaceState(null, "", url)
}

function buildIframeSrc(source: DocsFixtureSource) {
  const params = new URLSearchParams({ source })
  return `${docsBasePath}/demo-standalone?${params.toString()}`
}

export default function DemoShell() {
  const [selection, setSelection] = useState(() =>
    resolveDocsFixtureSelection(),
  )

  const onSourceChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const source = event.currentTarget.value as DocsFixtureSource
      setSelection((prev) => {
        updateParentQuery(source)
        return { ...prev, source }
      })
    },
    [],
  )

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <div style={styles.field}>
          <label style={styles.fieldLabel} htmlFor="demo-source">
            Data source
          </label>
          <select
            id="demo-source"
            value={selection.source}
            onChange={onSourceChange}
            style={styles.select}
          >
            {docsFixtureSources.map((source) => (
              <option key={source} value={source}>
                {sourceDescriptions[source]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <iframe
        src={buildIframeSrc(selection.source)}
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
