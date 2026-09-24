import { stripVTControlCharacters, styleText } from "node:util"
import { Markdown, type MarkdownTheme } from "@earendil-works/pi-tui"
import { createLogUpdate } from "log-update"

export type Terminal = {
  readonly write: (text: string, format?: "markdown") => void
  readonly status: (text: string) => void
  readonly clear: () => void
}

function trimRenderedPadding(text: string): string {
  const lines = text.split("\n")
  const hasContent = (line: string) =>
    stripVTControlCharacters(line).trim().length > 0
  return lines
    .slice(lines.findIndex(hasContent), lines.findLastIndex(hasContent) + 1)
    .join("\n")
}

/** Markdown owns document layout; log-update only owns the live status line. */
function renderMarkdown(
  text: string,
  width: number,
  stream: NodeJS.WriteStream,
): string {
  const style = (format: Parameters<typeof styleText>[0]) => (value: string) =>
    styleText(format, value, { stream })
  const theme: MarkdownTheme = {
    heading: style(["bold", "cyan"]),
    link: style("underline"),
    linkUrl: style("cyan"),
    code: style("cyan"),
    codeBlock: (value) => value,
    codeBlockBorder: style("dim"),
    quote: style("italic"),
    quoteBorder: style("dim"),
    hr: style("dim"),
    listBullet: (value) => value,
    bold: style("bold"),
    italic: style("italic"),
    strikethrough: style("strikethrough"),
    underline: style("underline"),
  }
  return new Markdown(text, 0, 0, theme, undefined, {
    preserveOrderedListMarkers: true,
    renderLatex: false,
  })
    .render(width)
    .join("\n")
}

export function createTerminal(
  stream: NodeJS.WriteStream = process.stdout,
  render: (text: string, width: number) => string = (text, width) =>
    renderMarkdown(text, width, stream),
): Terminal {
  const update = stream.isTTY
    ? createLogUpdate(stream, { showCursor: true })
    : undefined
  return {
    write(text, format) {
      const rendered =
        update !== undefined && format === "markdown"
          ? trimRenderedPadding(
              render(text, stream.columns > 0 ? stream.columns : 80),
            )
          : text
      update?.clear()
      // Do not pass permanent text through log-update's hard wrapping again.
      stream.write(`${rendered}\n`)
    },
    status(text) {
      update?.(text)
    },
    clear() {
      update?.clear()
    },
  }
}
