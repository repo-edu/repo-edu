import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderOpen,
  GitBranch,
} from "@repo-edu/ui/components/icons"
import { createContext, type ReactNode, useContext } from "react"

// ---------------------------------------------------------------------------
// Generic tree context factory
// ---------------------------------------------------------------------------

function createTreeContext<T>(displayName: string) {
  const Ctx = createContext<T | null>(null)
  const useCtx = () => {
    const v = useContext(Ctx)
    if (!v) throw new Error(`Missing ${displayName}`)
    return v
  }
  const Provider = ({ value, children }: { value: T; children: ReactNode }) => (
    <Ctx.Provider value={value}>{children}</Ctx.Provider>
  )
  return [Provider, useCtx] as const
}

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
// File tree context
// ---------------------------------------------------------------------------

type FileTreeContextValue = {
  openFolders: Set<string>
  toggleFolderOpen: (folder: string) => void
  effectiveFileSelection: Set<string>
  focusedFilePath: string | null
  onFileClick: (path: string) => void
}

const [FileTreeProvider, useFileTreeContext] =
  createTreeContext<FileTreeContextValue>("FileTreeProvider")

export { FileTreeProvider }

// ---------------------------------------------------------------------------
// Recursive folder node component
// ---------------------------------------------------------------------------

export function FolderNode({ node }: { node: FileTreeNode }) {
  const {
    openFolders,
    toggleFolderOpen,
    effectiveFileSelection,
    focusedFilePath,
    onFileClick,
  } = useFileTreeContext()
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
            <FolderNode key={child.path} node={child} />
          ))}
          {node.files.map((filePath) => {
            const basename = filePath.slice(filePath.lastIndexOf("/") + 1)
            return (
              <button
                key={filePath}
                type="button"
                className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors ${
                  focusedFilePath === filePath
                    ? "bg-selection font-medium"
                    : "hover:bg-accent"
                }`}
                onClick={() => onFileClick(filePath)}
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

// ---------------------------------------------------------------------------
// Repo tree context
// ---------------------------------------------------------------------------

type RepoTreeContextValue = {
  openFolders: Set<string>
  toggleFolderOpen: (folder: string) => void
  selectedRepoPath: string | null
  repoPathByRelative: Map<string, string>
  onRepoClick: (absolutePath: string) => void
}

const [RepoTreeProvider, useRepoTreeContext] =
  createTreeContext<RepoTreeContextValue>("RepoTreeProvider")

export { RepoTreeProvider }

// ---------------------------------------------------------------------------
// Repo leaf button (single repo entry in the tree)
// ---------------------------------------------------------------------------

export function RepoLeafButton({ relativePath }: { relativePath: string }) {
  const { selectedRepoPath, repoPathByRelative, onRepoClick } =
    useRepoTreeContext()
  const absolutePath = repoPathByRelative.get(relativePath)
  if (!absolutePath) throw new Error(`Unknown repo path: ${relativePath}`)
  const selected = selectedRepoPath === absolutePath
  const basename = relativePath.slice(relativePath.lastIndexOf("/") + 1)

  return (
    <button
      type="button"
      className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors ${
        selected ? "bg-selection font-medium" : "hover:bg-accent"
      }`}
      onClick={() => onRepoClick(absolutePath)}
    >
      <GitBranch className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{basename}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Recursive repo folder node component
// ---------------------------------------------------------------------------

export function RepoFolderNode({ node }: { node: FileTreeNode }) {
  const { openFolders, toggleFolderOpen } = useRepoTreeContext()
  const isOpen = openFolders.has(node.path)

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
      </button>
      {isOpen && (
        <div className="ml-4 flex flex-col gap-0.5 pt-0.5">
          {node.children.map((child) => (
            <RepoFolderNode key={child.path} node={child} />
          ))}
          {node.files.map((relativePath) => (
            <RepoLeafButton key={relativePath} relativePath={relativePath} />
          ))}
        </div>
      )}
    </div>
  )
}
