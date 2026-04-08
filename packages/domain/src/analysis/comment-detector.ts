import type { SupportedLanguage } from "./types.js"

// ---------------------------------------------------------------------------
// Comment markers (ported from gigui-python comment.py)
// ---------------------------------------------------------------------------

type CommentMarker = {
  start: string | null
  end: string | null
  line: string | null
}

const COMMENT_MARKERS: Record<SupportedLanguage, CommentMarker> = {
  ada: { start: null, end: null, line: "--" },
  adb: { start: null, end: null, line: "--" },
  ads: { start: null, end: null, line: "--" },
  c: { start: "/*", end: "*/", line: "//" },
  cc: { start: "/*", end: "*/", line: "//" },
  cif: { start: "/*", end: "*/", line: "//" },
  cpp: { start: "/*", end: "*/", line: "//" },
  cs: { start: "/*", end: "*/", line: "//" },
  glsl: { start: "/*", end: "*/", line: "//" },
  go: { start: "/*", end: "*/", line: "//" },
  h: { start: "/*", end: "*/", line: "//" },
  hh: { start: "/*", end: "*/", line: "//" },
  hpp: { start: "/*", end: "*/", line: "//" },
  hs: { start: "{-", end: "-}", line: "--" },
  html: { start: "<!--", end: "-->", line: null },
  ily: { start: "%{", end: "%}", line: "%" },
  java: { start: "/*", end: "*/", line: "//" },
  js: { start: "/*", end: "*/", line: "//" },
  jspx: { start: "<!--", end: "-->", line: null },
  ly: { start: "%{", end: "%}", line: "%" },
  ml: { start: "(*", end: "*)", line: null },
  mli: { start: "(*", end: "*)", line: null },
  php: { start: "/*", end: "*/", line: "//" },
  pl: { start: null, end: null, line: "#" },
  po: { start: null, end: null, line: "#" },
  pot: { start: null, end: null, line: "#" },
  py: { start: '"""', end: '"""', line: "#" },
  rb: { start: "=begin", end: "=end", line: "#" },
  rlib: { start: null, end: null, line: "//" },
  robot: { start: null, end: null, line: "#" },
  rs: { start: null, end: null, line: "//" },
  scala: { start: "/*", end: "*/", line: "//" },
  sql: { start: "/*", end: "*/", line: "--" },
  tex: { start: "\\begin{comment}", end: "\\end{comment}", line: "%" },
  tooldef: { start: "/*", end: "*/", line: "//" },
  ts: { start: "/*", end: "*/", line: "//" },
  xhtml: { start: "<!--", end: "-->", line: null },
  xml: { start: "<!--", end: "-->", line: null },
}

const MARKER_MUST_BE_AT_BEGINNING = new Set<SupportedLanguage>(["tex", "rb"])

// ---------------------------------------------------------------------------
// Extension → language mapping
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = new Set<string>(Object.keys(COMMENT_MARKERS))

export function extensionToLanguage(
  ext: string,
): SupportedLanguage | undefined {
  const normalized = ext.toLowerCase().replace(/^\./, "")
  return SUPPORTED_EXTENSIONS.has(normalized)
    ? (normalized as SupportedLanguage)
    : undefined
}

// ---------------------------------------------------------------------------
// Comment line classification
// ---------------------------------------------------------------------------

export function classifyCommentLines(
  lines: string[],
  language: SupportedLanguage,
): Set<number> {
  const marker = COMMENT_MARKERS[language]
  const commentIndices = new Set<number>()
  let inBlock = false
  const mustBeAtBeginning = MARKER_MUST_BE_AT_BEGINNING.has(language)

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trimStart()

    if (!inBlock) {
      if (marker.line !== null && stripped.startsWith(marker.line)) {
        commentIndices.add(i)
      } else if (marker.start !== null && stripped.startsWith(marker.start)) {
        commentIndices.add(i)
        const afterStart = stripped.slice(marker.start.length).trim()
        if (marker.end === null || !afterStart.endsWith(marker.end)) {
          inBlock = true
        }
      } else if (
        !mustBeAtBeginning &&
        marker.start !== null &&
        stripped.includes(marker.start)
      ) {
        inBlock = true
      }
    } else {
      commentIndices.add(i)
      if (marker.end !== null && stripped.endsWith(marker.end)) {
        inBlock = false
      }
    }
  }

  return commentIndices
}
