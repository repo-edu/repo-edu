import { dirname, join } from "node:path"
import { licenseTextForSpdxId } from "./license-text.js"
import {
  fileSha256,
  resolvePackageJsonPath,
  runtimePackageRecord,
} from "./runtime-package-record.js"
import type { CliReleasePlatform, NoticeEntry } from "./types.js"

export async function resolveCliRuntimeNoticeEntries(
  root: string,
  platform: CliReleasePlatform,
): Promise<NoticeEntry[]> {
  const bunEntry = await runtimePackageRecord("bun", {
    root,
    source: "Bun compiled CLI package-manager runtime",
  })
  // Fail closed before any further work if the installed Bun version is not
  // attested, so a bump cannot silently ship the previous version's linked set.
  const linkedRuntimes = attestedBunLinkedRuntimesFor(bunEntry.version)
  const bunPackagePath = dirname(resolvePackageJsonPath("bun", root))
  const ovenPackageName = await resolveSelectedOvenBunPackageName(
    bunPackagePath,
    platform,
  )
  const ovenEntry = await runtimePackageRecord(ovenPackageName, {
    root: bunPackagePath,
    source: "Bun compiled CLI platform runtime",
  })

  return [
    bunEntry,
    ovenEntry,
    ...linkedRuntimes.map((linked) =>
      bunLinkedRuntimeEntry({
        id: `bun-${linked.id}:${bunEntry.version}`,
        name: `${linked.subject} linked by Bun`,
        version: bunEntry.version,
        license: linked.license,
        source:
          "Bun compiled CLI runtime; Bun licensing documentation: https://bun.sh/docs/project/licensing",
      }),
    ),
  ]
}

// Bun statically links runtime libraries that no scanner and no CLI flag can
// enumerate from the installed binary, so the set is attested by hand against
// Bun's published licensing documentation. The table is keyed by the exact
// installed Bun version: any bump fails the gate closed until the linked set is
// re-verified, the same fail-closed version coupling the ripgrep and Codex
// records use.
type BunLinkedRuntime = {
  readonly id: string
  readonly subject: string
  readonly license: string
}

const attestedBunLinkedRuntimes = {
  "1.3.11": [
    {
      id: "javascriptcore",
      subject: "JavaScriptCore/WebKit",
      license: "LGPL-2.1-only",
    },
    { id: "tinycc", subject: "tinycc", license: "LGPL-2.1-only" },
  ],
} as const satisfies Record<string, readonly BunLinkedRuntime[]>

function attestedBunLinkedRuntimesFor(
  version: string,
): readonly BunLinkedRuntime[] {
  if (!Object.hasOwn(attestedBunLinkedRuntimes, version)) {
    throw new Error(
      `Bun runtime version ${version} is not attested. Re-verify the linked runtime set (e.g. JavaScriptCore, tinycc) against https://bun.sh/docs/project/licensing and add a ${version} entry to attestedBunLinkedRuntimes before shipping.`,
    )
  }
  return attestedBunLinkedRuntimes[
    version as keyof typeof attestedBunLinkedRuntimes
  ]
}

function bunLinkedRuntimeEntry(options: {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly license: string
  readonly source: string
}): NoticeEntry {
  return {
    id: options.id,
    kind: "runtime-asset",
    name: options.name,
    version: options.version,
    licenseExpression: options.license,
    source: options.source,
    licenseText: licenseTextForSpdxId(options.license),
    licenseEvidence: [
      `Bun's published licensing documentation identifies this linked runtime subject as ${options.license}.`,
      `The installed Bun npm package publishes no dedicated notice file for it, so the canonical ${options.license} license text above is supplied instead.`,
    ].join("\n"),
  }
}

type OvenBunPackageCandidate = {
  readonly packageName: string
  readonly executablePath: string
}

async function resolveSelectedOvenBunPackageName(
  bunPackagePath: string,
  platform: CliReleasePlatform,
): Promise<string> {
  // Bun's npm postinstall renames the selected platform binary out of its
  // @oven package into bun/bin/bun.exe (see node_modules/bun/install.js
  // optimizeBun), so the supplying candidate is identified by one of two
  // signals: its source binary is still present and byte-identical to the
  // installed runtime (copy semantics), or its source binary is now absent
  // because it was the one renamed away (move semantics, the real install).
  const installedBunBinary = join(bunPackagePath, "bin", "bun.exe")
  const installedDigest = await fileSha256(installedBunBinary)
  const digestMatched: string[] = []
  const movedOut: string[] = []
  const notInstalled: string[] = []

  for (const candidate of ovenBunPackageCandidates(platform)) {
    let packageJsonPath: string
    try {
      packageJsonPath = resolvePackageJsonPath(
        candidate.packageName,
        bunPackagePath,
      )
    } catch {
      notInstalled.push(candidate.packageName)
      continue
    }
    const candidateBinary = join(
      dirname(packageJsonPath),
      candidate.executablePath,
    )
    try {
      if ((await fileSha256(candidateBinary)) === installedDigest) {
        digestMatched.push(candidate.packageName)
      }
    } catch {
      // The package is installed but its source executable is gone: bun's
      // postinstall renamed it into the installed runtime, so this candidate
      // supplied the binary.
      movedOut.push(candidate.packageName)
    }
  }

  if (digestMatched.length === 1) {
    return digestMatched[0] as string
  }
  if (digestMatched.length === 0 && movedOut.length === 1) {
    return movedOut[0] as string
  }

  const candidateNames = ovenBunPackageCandidates(platform)
    .map((candidate) => candidate.packageName)
    .join(", ")
  throw new Error(
    `Could not resolve the @oven Bun runtime package that supplied ${installedBunBinary} for ${platform}. Candidates: ${candidateNames}. Digest matches: ${digestMatched.join(", ") || "none"}; moved into installed runtime: ${movedOut.join(", ") || "none"}; not installed: ${notInstalled.join(", ") || "none"}.`,
  )
}

function ovenBunPackageCandidates(
  platform: CliReleasePlatform,
): readonly OvenBunPackageCandidate[] {
  switch (platform) {
    case "darwin-arm64":
      return [
        {
          packageName: "@oven/bun-darwin-aarch64",
          executablePath: "bin/bun",
        },
      ]
    case "linux-arm64":
      return [
        {
          packageName: "@oven/bun-linux-aarch64",
          executablePath: "bin/bun",
        },
      ]
    case "linux-x64":
      return [
        {
          packageName: "@oven/bun-linux-x64",
          executablePath: "bin/bun",
        },
        {
          packageName: "@oven/bun-linux-x64-baseline",
          executablePath: "bin/bun",
        },
      ]
  }
}
