import { stripVTControlCharacters } from "node:util"
import { execaSync } from "execa"
import { createLogUpdate } from "log-update"
import { errorMessage } from "./feedback.js"

export type Terminal = {
  readonly write: (text: string, format?: "markdown") => void
  readonly status: (text: string) => void
  readonly clear: () => void
}

/** Glow owns Markdown layout; log-update only owns the live status line. */
function renderMarkdown(text: string, width: number): string {
  try {
    const { stdout } = execaSync(
      "glow",
      [
        "--style",
        process.env.GLOW_STYLE || "auto",
        "--width",
        String(width),
        "-",
      ],
      {
        input: text,
        // Environment overrides disable user-configured interactive modes.
        // Glow treats even --pager=false as a request to open the pager.
        env: { GLOW_PAGER: "false", GLOW_TUI: "false" },
      },
    )
    return process.env.NO_COLOR ? stripVTControlCharacters(stdout) : stdout
  } catch (cause) {
    throw new Error(`Glow could not render Markdown: ${errorMessage(cause)}`, {
      cause,
    })
  }
}

export function createTerminal(
  stream: NodeJS.WriteStream = process.stdout,
  render: (text: string, width: number) => string = renderMarkdown,
): Terminal {
  const update = stream.isTTY
    ? createLogUpdate(stream, { showCursor: true })
    : undefined
  return {
    write(text, format) {
      const rendered =
        update !== undefined && format === "markdown"
          ? render(text, stream.columns > 0 ? stream.columns : 80)
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
