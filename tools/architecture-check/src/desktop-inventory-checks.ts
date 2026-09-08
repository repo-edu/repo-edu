import { readFileSync } from "node:fs"
import {
  compareEntryMembers,
  readEntryMembers,
  syntaxTree,
} from "./desktop-inventory-syntax.js"
import { desktopLifetimeLists } from "./desktop-lifetime-inventory.js"
import { desktopEntryLists } from "./desktop-source-inventory.js"
import type { SourceInventory } from "./inventory.js"
import { rendererInputLists } from "./renderer-input-inventory.js"
import { repoPathToAbsolute } from "./repo-paths.js"
import type { Violation } from "./violations.js"

export const ownershipEntryLists = [
  ...desktopEntryLists,
  ...desktopLifetimeLists,
  ...rendererInputLists,
]

export function checkDesktopInventories(
  root: string,
  inventory: SourceInventory,
): Violation[] {
  const sources = new Map<string, string>()
  for (const { file } of ownershipEntryLists) {
    if (inventory.fileSet.has(file) && !sources.has(file))
      sources.set(file, readFileSync(repoPathToAbsolute(root, file), "utf8"))
  }
  return checkDesktopInventorySources(sources)
}

export function checkDesktopInventorySources(
  sources: ReadonlyMap<string, string>,
): Violation[] {
  return ownershipEntryLists.flatMap((list) => {
    const content = sources.get(list.file)
    if (content === undefined)
      return [{ file: list.file, message: `${list.owner}: missing list owner` }]
    const members = readEntryMembers(
      syntaxTree(list.file, content),
      list.selector,
    )
    return compareEntryMembers(list.members, members).map((message) => ({
      file: list.file,
      message: `${list.owner}: ${message}`,
    }))
  })
}
