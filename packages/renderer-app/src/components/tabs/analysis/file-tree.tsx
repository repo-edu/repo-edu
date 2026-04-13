import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderOpen,
} from "@repo-edu/ui/components/icons"

// ---------------------------------------------------------------------------
// File tree data structure
// ---------------------------------------------------------------------------

const ROOT_FOLDER = "(root)"

export type FileTreeNode = {
  name: string
  path: string
  files: string[]
  children: FileTreeNode[]
}

export function buildFileTree(paths: string[]): FileTreeNode {
  const root: FileTreeNode = {
    name: ROOT_FOLDER,
    path: ROOT_FOLDER,
    files: [],
    children: [],
  }
  for (const filePath of paths) {
    const segments = filePath.split("/")
    segments.pop()
    let current = root
    let currentPath = ""
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      let child = current.children.find((c) => c.name === segment)
      if (!child) {
        child = { name: segment, path: currentPath, files: [], children: [] }
        current.children.push(child)
      }
      current = child
    }
    current.files.push(filePath)
  }
  const sortNode = (node: FileTreeNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name))
    node.files.sort()
    for (const child of node.children) sortNode(child)
  }
  sortNode(root)
  const compact = (node: FileTreeNode) => {
    for (const child of node.children) compact(child)
    while (
      node.children.length === 1 &&
      node.files.length === 0 &&
      node.path !== ROOT_FOLDER
    ) {
      const only = node.children[0]
      node.name = `${node.name}/${only.name}`
      node.path = only.path
      node.files = only.files
      node.children = only.children
    }
  }
  compact(root)
  return root
}

export function collectFolderPaths(node: FileTreeNode): string[] {
  const result: string[] = []
  if (node.files.length > 0) result.push(node.path)
  for (const child of node.children) {
    result.push(child.path)
    result.push(...collectFolderPaths(child))
  }
  return result
}

export function countSelected(
  node: FileTreeNode,
  selection: Set<string>,
): { selected: number; total: number } {
  let selected = 0
  let total = node.files.length
  for (const f of node.files) {
    if (selection.has(f)) selected++
  }
  for (const child of node.children) {
    const c = countSelected(child, selection)
    selected += c.selected
    total += c.total
  }
  return { selected, total }
}

// ---------------------------------------------------------------------------
// Recursive folder node component
// ---------------------------------------------------------------------------

export function FolderNode({
  node,
  openFolders,
  toggleFolderOpen,
  effectiveFileSelection,
  focusedFilePath,
  handleFileClick,
}: {
  node: FileTreeNode
  openFolders: Set<string>
  toggleFolderOpen: (folder: string) => void
  effectiveFileSelection: Set<string>
  focusedFilePath: string | null
  handleFileClick: (path: string) => void
}) {
  const isOpen = openFolders.has(node.path)
  const { selected, total } = countSelected(node, effectiveFileSelection)

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors hover:bg-accent"
        onClick={() => toggleFolderOpen(node.path)}
      >
        {isOpen ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        {isOpen ? (
          <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <Folder className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate font-medium">{node.name}</span>
        <span className="shrink-0 text-muted-foreground">
          {selected}/{total}
        </span>
      </button>
      {isOpen && (
        <div className="ml-4 flex flex-col gap-0.5 pt-0.5">
          {node.children.map((child) => (
            <FolderNode
              key={child.path}
              node={child}
              openFolders={openFolders}
              toggleFolderOpen={toggleFolderOpen}
              effectiveFileSelection={effectiveFileSelection}
              focusedFilePath={focusedFilePath}
              handleFileClick={handleFileClick}
            />
          ))}
          {node.files.map((filePath) => {
            const basename = filePath.slice(filePath.lastIndexOf("/") + 1)
            return (
              <button
                key={filePath}
                type="button"
                className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors hover:bg-accent ${
                  focusedFilePath === filePath ? "bg-accent font-medium" : ""
                }`}
                onClick={() => handleFileClick(filePath)}
              >
                <FileCode className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate" title={filePath}>
                  {basename}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
