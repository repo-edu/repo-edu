import { basename, dirname, resolve } from "node:path"
import {
  type CompileContext,
  type Extension,
  fromMarkdown,
  type Token,
} from "mdast-util-from-markdown"

type Edit = {
  readonly start: number
  readonly end: number
  readonly text: string
}

/**
 * Point every link, image and definition in one Markdown file whose
 * destination names `from` at `to`, a file of another name in the same folder.
 * A link whose whole text is the old file name takes the new name too, so it
 * does not show a name that no longer exists. Every other byte stays as it was.
 *
 * The parser reports a node's destination only as decoded text, so the
 * extension records the source span of each destination token. The parser has
 * no handler of its own for these tokens, so the extension replaces none.
 */
export function retargetLinks(
  source: string,
  file: string,
  from: string,
  to: string,
): string {
  const destinations: {
    readonly node: CompileContext["stack"][number]
    readonly start: number
    readonly end: number
  }[] = []
  function record(this: CompileContext, token: Token) {
    destinations.push({
      node: this.stack[this.stack.length - 1],
      start: token.start.offset,
      end: token.end.offset,
    })
  }
  const extension: Extension = {
    exit: { resourceDestination: record, definitionDestination: record },
  }
  fromMarkdown(source, { mdastExtensions: [extension] })

  const oldName = basename(from)
  const newName = basename(to)
  const edits: Edit[] = []
  for (const { node, start, end } of destinations) {
    const enclosed = source[start] === "<"
    const opening = enclosed ? start + 1 : start
    const [path] = source.slice(opening, enclosed ? end - 1 : end).split("#")
    if (!path.endsWith(oldName) || resolve(dirname(file), path) !== from)
      continue
    const pathEnd = opening + path.length
    edits.push({ start: pathEnd - oldName.length, end: pathEnd, text: newName })

    if (node.type !== "link" || node.children.length !== 1) continue
    const [label] = node.children
    const labelStart = label.position?.start.offset
    const labelEnd = label.position?.end.offset
    if (
      (label.type !== "inlineCode" && label.type !== "text") ||
      label.value !== oldName ||
      labelStart === undefined ||
      labelEnd === undefined
    )
      continue
    edits.push({
      start: labelStart,
      end: labelEnd,
      text: source.slice(labelStart, labelEnd).replace(oldName, newName),
    })
  }
  return edits
    .sort((left, right) => right.start - left.start)
    .reduce(
      (text, edit) =>
        text.slice(0, edit.start) + edit.text + text.slice(edit.end),
      source,
    )
}
