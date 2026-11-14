import { styleText } from "node:util"
import {
  type Component,
  getKeybindings,
  Key,
  matchesKey,
  ProcessTerminal,
  type Terminal as Screen,
  ScrollView,
  TuiAltScreen,
  truncateToWidth,
  VStack,
  visibleWidth,
} from "@earendil-works/pi-tui"
import {
  type DocumentLayout,
  layoutDocument,
  pinnedLines,
  type RenderLines,
  steppedTop,
} from "./pinned-headings.js"
import { renderMarkdownLines } from "./terminal.js"

/**
 * Shows a Markdown document in a full-screen view the reader scrolls, with the
 * heading lines of the part under the top edge kept in view. It resolves when
 * the reader leaves and prints nothing itself, so the caller's ordinary write
 * stays the only permanent output.
 */
export type Pager = (markdown: string) => Promise<void>

const keys = "↑ ↓ PgUp PgDn Home End scroll · q Esc quit"

/** Where a step of `lines` from `top` ends in a view `viewport` lines high. */
type Step = (top: number, lines: number, viewport: number) => number

/**
 * A scroll view whose steps end where `step` says. The library sends every
 * line key, page key and wheel move through `scrollBy`, so this is the one
 * place that turns a step of lines into a step of whole rows.
 */
class SteppedScrollView extends ScrollView {
  readonly #step: Step

  constructor(component: Component, step: Step) {
    super(component, { primary: true })
    this.#step = step
  }

  override scrollBy(lines: number): number {
    const top = this.scrollTop
    const requested = Number.isFinite(lines) ? Math.trunc(lines) : 0
    return super.scrollBy(this.#step(top, requested, this.viewportHeight) - top)
  }
}

/**
 * The view opens only for a reader at a terminal and a document taller than
 * the screen. Any other document already shows whole, so the caller's write is
 * enough.
 */
export function createPager(
  stream: NodeJS.WriteStream = process.stdout,
  input: { readonly isTTY?: boolean } = process.stdin,
  openScreen: () => Screen = () => new ProcessTerminal(),
  render: RenderLines = (markdown, width) =>
    renderMarkdownLines(markdown, width, stream),
): Pager {
  return async (markdown) => {
    if (!stream.isTTY || !input.isTTY) return
    const screen = openScreen()
    let layout: (DocumentLayout & { readonly width: number }) | undefined
    const layoutAt = (width: number) => {
      if (layout?.width !== width)
        layout = { width, ...layoutDocument(markdown, width, render) }
      return layout
    }
    if (layoutAt(screen.columns).lines.length < screen.rows) return

    const { promise: left, resolve: leave } = Promise.withResolvers<void>()
    const scroll = new SteppedScrollView(
      {
        render: (width) => layoutAt(width).lines,
        invalidate: () => {
          layout = undefined
        },
      },
      (top, lines, viewport) =>
        steppedTop(layoutAt(screen.columns), top, lines, viewport),
    )
    // The pinned lines are drawn over the view's first lines rather than above
    // it, so the document never jumps when their number changes.
    const pinned: Component = {
      render: (width) => pinnedLines(layoutAt(width), scroll.scrollTop),
      invalidate: () => {},
    }
    // The footer holds the keyboard focus, so `q` and Esc leave only while the
    // reader is not typing into the library's search panel. There `q` is text
    // and Esc closes the panel.
    const footer: Component = {
      render: (width) => {
        const total = layoutAt(width).lines.length
        const last = Math.min(total, scroll.scrollTop + scroll.viewportHeight)
        const position = `lines ${scroll.scrollTop + 1}–${last} of ${total}`
        const gap = Math.max(
          2,
          width - visibleWidth(keys) - visibleWidth(position),
        )
        return [
          styleText(
            "dim",
            truncateToWidth(`${keys}${" ".repeat(gap)}${position}`, width, ""),
            { stream },
          ),
        ]
      },
      handleInput: (data) => {
        if (matchesKey(data, "q") || matchesKey(data, "escape")) leave()
      },
      invalidate: () => {},
    }

    // The library binds no key to one line of scrolling, which the scroll view
    // turns into one row. Letters stay unbound because its search panel reads
    // them as text.
    getKeybindings().setUserBindings({
      "tui.altScreen.lineUp": "up",
      "tui.altScreen.lineDown": "down",
    })
    const tui = new TuiAltScreen(screen, false, undefined, {
      wheelScrollLines: "auto",
    })
    tui.setLayoutRoot(
      new VStack([
        { component: scroll, basis: 0, grow: 1, minSize: 1 },
        { component: footer, basis: 1, shrink: 0 },
      ]),
    )
    tui.showOverlay(pinned, {
      row: 0,
      col: 0,
      width: "100%",
      maxHeight: "50%",
      nonCapturing: true,
    })
    tui.setFocus(footer)
    // Raw input carries Ctrl-C as a key, so no interrupt signal ends the view.
    tui.addInputListener((data) => {
      if (!matchesKey(data, Key.ctrl("c"))) return undefined
      leave()
      return { consume: true }
    })
    tui.start()
    try {
      await left
      // Let late key reports arrive before the shell reads the keyboard again.
      await screen.drainInput()
    } finally {
      // The caller prints the document, so the library must not print it too.
      tui.stop({ preserveScreen: true })
    }
  }
}
