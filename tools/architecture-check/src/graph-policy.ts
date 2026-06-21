import type {
  CompiledAreaModel,
  PartitionArea,
  PatternMember,
} from "./area-model.js"
import { matcherMatchesFile } from "./area-model.js"
import {
  type SourceInventory,
  sourceInventoryPathPattern,
} from "./inventory.js"

export type DependencyCruiserRule = {
  readonly name: string
  readonly severity: "error"
  readonly comment?: string
  readonly from: {
    readonly path?: string | readonly string[]
    readonly pathNot?: string | readonly string[]
  }
  readonly to: {
    readonly path?: string | readonly string[]
    readonly pathNot?: string | readonly string[]
    readonly circular?: boolean
    readonly viaOnly?: {
      readonly path?: string | readonly string[]
      readonly pathNot?: string | readonly string[]
    }
  }
}

export type DependencyCruiserRuleSet = {
  readonly forbidden: readonly DependencyCruiserRule[]
}

const TEST_PATH_PATTERN = "(^|/)__tests__/"

const DOMAIN_MODULE_ORDER = [
  "types",
  "settings",
  "roster",
  "roster-lms-merge",
  "group-set",
  "group-set-import-export",
  "group-selection",
  "repository-planning",
  "validation",
  "schemas",
] as const

type Selector =
  | {
      readonly kind: "path-group"
      readonly id: string
      readonly areaId: string
      readonly path: readonly string[]
      readonly pathNot?: readonly string[]
    }
  | { readonly kind: "external"; readonly id: string; readonly path: string }

type CompiledSelector = {
  readonly path: readonly string[]
  readonly pathNot: readonly string[]
}

const CROSS_LAYER_POLICIES: readonly {
  readonly name: string
  readonly from: string
  readonly to: readonly string[]
  readonly testException: boolean
}[] = [
  {
    name: "domain-not-to-runtime-layers",
    from: "pkg-domain",
    to: [
      "pkg-application",
      "pkg-renderer-session",
      "pkg-renderer-persistence",
      "pkg-renderer-analysis",
      "pkg-renderer-examination",
      "pkg-renderer-groups",
      "pkg-renderer-settings",
      "pkg-renderer-shell",
      "pkg-tree-sitter-grammar-assets",
      "app-cli",
      "app-desktop",
      "app-docs",
    ],
    testException: true,
  },
  {
    name: "host-runtime-contract-not-to-grammar-assets",
    from: "pkg-host-runtime-contract",
    to: ["pkg-tree-sitter-grammar-assets"],
    testException: true,
  },
  {
    name: "application-contract-not-to-runtime-layers",
    from: "pkg-application-contract",
    to: [
      "pkg-application",
      "pkg-renderer-session",
      "pkg-renderer-persistence",
      "pkg-renderer-analysis",
      "pkg-renderer-examination",
      "pkg-renderer-groups",
      "pkg-renderer-settings",
      "pkg-renderer-shell",
      "app-cli",
      "app-desktop",
      "app-docs",
      "pkg-host-node",
    ],
    testException: true,
  },
  {
    name: "renderer-not-to-node-integrations",
    from: "renderer-app",
    to: [
      "git-integration-src",
      "lms-integration-src",
      "llm-integration-src",
      "pkg-host-node",
    ],
    testException: true,
  },
]

const NAMED_SELECTORS: readonly Selector[] = [
  {
    kind: "path-group",
    id: "renderer-app",
    areaId: "pkg-renderer-shell",
    path: ["^packages/renderer-app/src/"],
  },
  {
    kind: "path-group",
    id: "git-integration-src",
    areaId: "pkg-integrations-git",
    path: ["^packages/integrations-git/src/"],
  },
  {
    kind: "path-group",
    id: "lms-integration-src",
    areaId: "pkg-integrations-lms",
    path: ["^packages/integrations-lms/src/"],
  },
  {
    kind: "path-group",
    id: "llm-integration-src",
    areaId: "pkg-integrations-llm",
    path: ["^packages/integrations-llm/src/"],
  },
  {
    kind: "external",
    id: "anthropic-claude-agent-sdk",
    path: "(^|/)node_modules/@anthropic-ai/claude-agent-sdk/",
  },
]

const GENERATED_FIXTURE_TARGET_PATTERN =
  "^apps/docs/src/fixtures/projects/[^/]+/generated/"

export function buildDependencyCruiserRuleSet(
  model: CompiledAreaModel,
  inventory?: SourceInventory,
): DependencyCruiserRuleSet {
  const selectors = buildSelectorMap(model, inventory)
  const sourceInventory = sourceInventorySelector(inventory)
  const forbidden: DependencyCruiserRule[] = [
    ...domainModuleOrderRules(),
    ...crossLayerRules(selectors),
    claudeCoderPackageRule(selectors, sourceInventory),
    claudeAgentSdkRule(selectors, sourceInventory),
    wholeInventoryCycleRule(sourceInventory),
  ]

  return { forbidden }
}

function buildSelectorMap(
  model: CompiledAreaModel,
  inventory?: SourceInventory,
): ReadonlyMap<string, CompiledSelector> {
  const selectors = new Map<string, CompiledSelector>()

  for (const partition of model.partitions) {
    selectors.set(
      partition.id,
      selectorFromPartition(model, partition, inventory),
    )
  }

  for (const selector of NAMED_SELECTORS) {
    if (selector.kind === "external") {
      selectors.set(selector.id, { path: [selector.path], pathNot: [] })
      continue
    }

    if (!selectors.has(selector.areaId)) {
      throw new Error(
        `Selector ${selector.id} references unknown area ${selector.areaId}`,
      )
    }
    selectors.set(selector.id, {
      ...selectorFromPathGroup(selector, inventory),
    })
  }

  return selectors
}

function selectorFromPartition(
  model: CompiledAreaModel,
  partition: PartitionArea,
  inventory?: SourceInventory,
): CompiledSelector {
  if (inventory) {
    const matcher = model.partitionMatchers.get(partition.id)
    const files =
      matcher === undefined
        ? []
        : inventory.files.filter((file) => matcherMatchesFile(matcher, file))
    return exactFileSelector(files)
  }

  return {
    path: partition.members
      .filter((member): member is PatternMember => member.type === "pattern")
      .map((member) => member.path),
    pathNot: (partition.exclude ?? []).map((member) => member.path),
  }
}

function selectorFromPathGroup(
  selector: Extract<Selector, { readonly kind: "path-group" }>,
  inventory?: SourceInventory,
): CompiledSelector {
  if (!inventory) {
    return {
      path: selector.path,
      pathNot: selector.pathNot ?? [],
    }
  }

  const includePatterns = selector.path.map((pattern) => new RegExp(pattern))
  const excludePatterns = (selector.pathNot ?? []).map(
    (pattern) => new RegExp(pattern),
  )
  return exactFileSelector(
    inventory.files.filter(
      (file) =>
        includePatterns.some((pattern) => pattern.test(file)) &&
        !excludePatterns.some((pattern) => pattern.test(file)),
    ),
  )
}

function selector(
  selectors: ReadonlyMap<string, CompiledSelector>,
  id: string,
): CompiledSelector {
  const selected = selectors.get(id)
  if (!selected) throw new Error(`Unknown graph-policy selector: ${id}`)
  return selected
}

function domainModuleOrderRules(): DependencyCruiserRule[] {
  return DOMAIN_MODULE_ORDER.flatMap((moduleName, index) => {
    const forbiddenTargets = DOMAIN_MODULE_ORDER.slice(index)
    if (forbiddenTargets.length === 0) return []

    return [
      {
        name: `domain-${moduleName}-module-order`,
        severity: "error" as const,
        comment: "Domain modules may import only earlier modules.",
        from: {
          path: `^packages/domain/src/${moduleName}\\.ts$`,
        },
        to: {
          path: forbiddenTargets.map(
            (target) => `^packages/domain/src/${target}\\.ts$`,
          ),
        },
      },
    ]
  })
}

function crossLayerRules(
  selectors: ReadonlyMap<string, CompiledSelector>,
): DependencyCruiserRule[] {
  return CROSS_LAYER_POLICIES.flatMap((policy) => {
    const from = selector(selectors, policy.from)
    const fromPathNot = policy.testException
      ? [...from.pathNot, TEST_PATH_PATTERN]
      : from.pathNot

    return policy.to.map((targetId) => {
      const to = selector(selectors, targetId)
      return {
        name: `${policy.name}-${targetId}`,
        severity: "error" as const,
        comment: "Declarative source layer boundary.",
        from: {
          path: from.path,
          pathNot: fromPathNot,
        },
        to: {
          path: to.path,
          pathNot: to.pathNot,
        },
      }
    })
  })
}

function claudeCoderPackageRule(
  selectors: ReadonlyMap<string, CompiledSelector>,
  sourceInventory: CompiledSelector,
): DependencyCruiserRule {
  const fixtureEngine = selector(selectors, "pkg-fixture-engine")
  const claudeCoder = selector(selectors, "pkg-claude-coder")
  return {
    name: "claude-coder-confined-to-fixture-engine",
    severity: "error",
    comment:
      "The dev-only claude-coder package may only be used by fixture-engine.",
    from: {
      path: sourceInventory.path,
      pathNot: [
        ...sourceInventory.pathNot,
        ...fixtureEngine.path,
        ...claudeCoder.path,
      ],
    },
    to: {
      path: claudeCoder.path,
    },
  }
}

function claudeAgentSdkRule(
  selectors: ReadonlyMap<string, CompiledSelector>,
  sourceInventory: CompiledSelector,
): DependencyCruiserRule {
  const claudeCoder = selector(selectors, "pkg-claude-coder")
  const agentSdk = selector(selectors, "anthropic-claude-agent-sdk")
  return {
    name: "claude-agent-sdk-confined-to-claude-coder",
    severity: "error",
    comment:
      "The proprietary Claude agent SDK may only be used by claude-coder.",
    from: {
      path: sourceInventory.path,
      pathNot: [...sourceInventory.pathNot, ...claudeCoder.path],
    },
    to: {
      path: agentSdk.path,
    },
  }
}

function wholeInventoryCycleRule(
  inventory: CompiledSelector,
): DependencyCruiserRule {
  return {
    name: "source-inventory-no-circular",
    severity: "error",
    comment: "The source-inventory import graph must be acyclic.",
    from: {
      path: inventory.path,
      pathNot: inventory.pathNot,
    },
    to: {
      circular: true,
      viaOnly: {
        path: inventory.path,
        pathNot: inventory.pathNot,
      },
    },
  }
}

function sourceInventorySelector(
  inventory?: SourceInventory,
): CompiledSelector {
  if (inventory) return exactFileSelector(inventory.files)

  return {
    path: [sourceInventoryPathPattern()],
    pathNot: [GENERATED_FIXTURE_TARGET_PATTERN],
  }
}

function exactFileSelector(files: readonly string[]): CompiledSelector {
  return {
    path: files.length > 0 ? files.map(exactPathPattern) : ["a^"],
    pathNot: [],
  }
}

function exactPathPattern(filePath: string): string {
  return `^${escapeRegExp(filePath)}$`
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
}
