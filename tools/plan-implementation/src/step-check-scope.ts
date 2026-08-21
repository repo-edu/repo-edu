import { isAbsolute, relative, resolve, sep } from "node:path"

export type WorkspaceProject = {
  readonly name: string
  readonly relativeRoot: string
}

export type StepCheckScope =
  | { readonly kind: "root" }
  | {
      readonly kind: "packages"
      readonly changedPackages: readonly WorkspaceProject[]
      readonly checkedPackages: readonly WorkspaceProject[]
    }

export type WorkspaceProjectSelection =
  | { readonly kind: "all" }
  | {
      readonly kind: "dependants"
      readonly packageNames: readonly string[]
    }

export type WorkspaceProjectReader = (
  selection: WorkspaceProjectSelection,
) => Promise<string | null>

type RawWorkspaceProject = {
  readonly name?: unknown
  readonly path?: unknown
}

type ResolveStepCheckScopeRequest = {
  readonly repoEduRoot: string
  readonly admittedPaths: readonly string[]
  readonly finalStep: boolean
  readonly readWorkspaceProjects: WorkspaceProjectReader
}

const rootScope: StepCheckScope = Object.freeze({ kind: "root" })

function toGitPath(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/")
}

function parseWorkspaceProjects(
  repoEduRoot: string,
  output: string,
): readonly WorkspaceProject[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  const root = resolve(repoEduRoot)
  const names = new Set<string>()
  const roots = new Set<string>()
  const projects: WorkspaceProject[] = []
  for (const value of parsed) {
    if (typeof value !== "object" || value === null) return null
    const { name, path } = value as RawWorkspaceProject
    if (
      typeof name !== "string" ||
      name.length === 0 ||
      typeof path !== "string" ||
      !isAbsolute(path)
    ) {
      return null
    }
    const projectPath = resolve(path)
    const relativeRoot = toGitPath(relative(root, projectPath))
    if (relativeRoot === "") continue
    if (relativeRoot === ".." || relativeRoot.startsWith("../")) return null
    if (names.has(name) || roots.has(relativeRoot)) return null
    names.add(name)
    roots.add(relativeRoot)
    projects.push(Object.freeze({ name, relativeRoot }))
  }
  return Object.freeze(
    projects.sort((first, second) =>
      first.relativeRoot.localeCompare(second.relativeRoot),
    ),
  )
}

function findOwningProject(
  path: string,
  projects: readonly WorkspaceProject[],
): WorkspaceProject | null {
  let owner: WorkspaceProject | null = null
  for (const project of projects) {
    if (
      path !== project.relativeRoot &&
      !path.startsWith(`${project.relativeRoot}/`)
    ) {
      continue
    }
    if (
      owner === null ||
      project.relativeRoot.length > owner.relativeRoot.length
    ) {
      owner = project
    }
  }
  return owner
}

function selectChangedPackages(
  admittedPaths: readonly string[],
  projects: readonly WorkspaceProject[],
): readonly WorkspaceProject[] | null {
  const packageManifestOwners = new Set<string>()
  for (const path of admittedPaths) {
    if (!path.endsWith("/package.json")) continue
    const owner = findOwningProject(path, projects)
    if (owner !== null && path === `${owner.relativeRoot}/package.json`) {
      packageManifestOwners.add(owner.name)
    }
  }

  const changedNames = new Set<string>()
  for (const path of admittedPaths) {
    if (path === "pnpm-lock.yaml" && packageManifestOwners.size > 0) continue
    const owner = findOwningProject(path, projects)
    if (owner === null) return null
    changedNames.add(owner.name)
  }
  if (changedNames.size === 0) return null
  return Object.freeze(
    projects.filter((project) => changedNames.has(project.name)),
  )
}

function matchCheckedPackages(
  allProjects: readonly WorkspaceProject[],
  changedPackages: readonly WorkspaceProject[],
  selectedProjects: readonly WorkspaceProject[],
): readonly WorkspaceProject[] | null {
  const allByName = new Map(
    allProjects.map((project) => [project.name, project] as const),
  )
  const selectedNames = new Set<string>()
  const checkedPackages: WorkspaceProject[] = []
  for (const selected of selectedProjects) {
    const known = allByName.get(selected.name)
    if (
      known === undefined ||
      known.relativeRoot !== selected.relativeRoot ||
      selectedNames.has(selected.name)
    ) {
      return null
    }
    selectedNames.add(selected.name)
    checkedPackages.push(known)
  }
  if (changedPackages.some((project) => !selectedNames.has(project.name))) {
    return null
  }
  return Object.freeze(
    checkedPackages.sort((first, second) =>
      first.name.localeCompare(second.name),
    ),
  )
}

export async function resolveStepCheckScope(
  request: ResolveStepCheckScopeRequest,
): Promise<StepCheckScope> {
  if (request.finalStep) return rootScope

  const allOutput = await request.readWorkspaceProjects({ kind: "all" })
  if (allOutput === null) return rootScope
  const allProjects = parseWorkspaceProjects(request.repoEduRoot, allOutput)
  if (allProjects === null) return rootScope

  const changedPackages = selectChangedPackages(
    request.admittedPaths,
    allProjects,
  )
  if (changedPackages === null) return rootScope

  const packageNames = Object.freeze(
    changedPackages.map((project) => project.name),
  )
  const selectedOutput = await request.readWorkspaceProjects({
    kind: "dependants",
    packageNames,
  })
  if (selectedOutput === null) return rootScope
  const selectedProjects = parseWorkspaceProjects(
    request.repoEduRoot,
    selectedOutput,
  )
  if (selectedProjects === null) return rootScope
  const checkedPackages = matchCheckedPackages(
    allProjects,
    changedPackages,
    selectedProjects,
  )
  if (checkedPackages === null) return rootScope

  return Object.freeze({
    kind: "packages",
    changedPackages,
    checkedPackages,
  })
}
