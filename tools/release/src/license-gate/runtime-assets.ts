import {
  closureContainsPackage,
  findReachedPackageByReachedName,
} from "./closure.js"
import { resolveCliRuntimeNoticeEntries } from "./runtime-cli.js"
import {
  resolveOpenAiCodexPlatformRuntime,
  resolveRipgrepNoticeEntries,
} from "./runtime-codex.js"
import { resolveDesktopRuntimePackageEntries } from "./runtime-desktop.js"
import { resolveTokenizerGrammarRuntimeAssets } from "./runtime-tokenizer.js"
import type {
  LicenseGateOptions,
  NoticeEntry,
  ReachedPackage,
  ReleaseRuntimeDecision,
} from "./types.js"

export { resolveCliRuntimeNoticeEntries, resolveDesktopRuntimePackageEntries }

const noExtraDesktopRuntime: Record<string, string> = {
  dmg: "No extra third-party runtime beyond the Electron app payload is added by this target.",
  zip: "No extra third-party runtime beyond the Electron app payload is added by this target.",
  deb: "No extra third-party runtime beyond the Electron app payload is added by this target.",
}

export async function collectRuntimeNoticeEntries(
  options: LicenseGateOptions,
  root: string,
  productionReached: readonly ReachedPackage[],
): Promise<{
  readonly entries: readonly NoticeEntry[]
  readonly decisions: readonly ReleaseRuntimeDecision[]
}> {
  const entries: NoticeEntry[] = []
  const decisions: ReleaseRuntimeDecision[] = []

  if (options.app === "desktop") {
    entries.push(
      ...(await resolveDesktopRuntimePackageEntries({
        root,
        platform: options.platform,
        artifactTargets: options.artifactTargets,
        productionReached,
      })),
    )

    for (const target of options.artifactTargets) {
      const decision = noExtraDesktopRuntime[target]
      if (decision) {
        decisions.push({ target, decision })
      }
      if (target === "nsis") {
        decisions.push({
          target,
          decision:
            "NSIS installer runtime and Windows packaging resources are represented by electron-builder-squirrel-windows and app-builder-bin package records.",
        })
      }
    }
  } else {
    entries.push(
      ...(await resolveCliRuntimeNoticeEntries(root, options.platform)),
    )
  }

  if (
    options.app === "desktop" ||
    closureContainsPackage(
      productionReached,
      "@repo-edu/tree-sitter-grammar-assets",
    )
  ) {
    entries.push(...(await resolveTokenizerGrammarRuntimeAssets()))
  }

  const codexRoot = findReachedPackageByReachedName(
    productionReached,
    "@openai/codex",
  )
  if (codexRoot?.packageDirectoryExists) {
    const platformRuntime = await resolveOpenAiCodexPlatformRuntime(
      codexRoot,
      options.platform,
    )
    entries.push(platformRuntime.entry)
    entries.push(
      ...(await resolveRipgrepNoticeEntries({
        codexRoot,
        platform: options.platform,
        platformPackageName: platformRuntime.packageName,
        platformPackagePath: platformRuntime.packagePath,
      })),
    )
  }

  return { entries, decisions }
}
