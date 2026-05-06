const docsBasePath = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL.slice(0, -1)
  : import.meta.env.BASE_URL

export default function DemoShell() {
  return (
    <div style={styles.root}>
      <iframe
        src={`${docsBasePath}/demo-standalone`}
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
  iframe: {
    flex: 1,
    width: "100%",
    border: "none",
  },
}
