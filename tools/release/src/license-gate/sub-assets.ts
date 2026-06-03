import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { open, readdir, readFile, stat } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import {
  dotslashPlatformKey,
  extractRipgrepVersion,
  fetchVerifiedArchive,
  parseDotslashManifest,
  readArchiveTextFiles,
  resolveOpenAiCodexDotslashManifest,
} from "./archive.js"
import { normalizePath, packageKey, readRequiredTextFiles } from "./shared.js"
import type {
  DirectNoticeSubject,
  PackageNoticeSubject,
  ReleasePlatform,
} from "./types.js"

const binaryMagicHeaders = [
  [0x7f, 0x45, 0x4c, 0x46],
  [0xca, 0xfe, 0xba, 0xbe],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0x4d, 0x5a],
]

const partialJsonParserLicenseText = `partial-json-parser vendored by @anthropic-ai/sdk
Upstream package: https://www.npmjs.com/package/partial-json-parser
Upstream version inspected for this notice rule: 1.2.2

MIT License

Copyright (c) 2017 indgov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const trpcCookieEsLicenseText = `cookie-es vendored by @trpc/server
Upstream package: https://www.npmjs.com/package/cookie-es
Upstream version inspected for this notice rule: 1.2.2

MIT License

Cookie-es copyright (c) Pooya Parsa <pooya@pi0.io>

Cookie parsing based on https://github.com/jshttp/cookie
Copyright (c) 2012-2014 Roman Shtylman <shtylman@gmail.com>
Copyright (c) 2015 Douglas Christopher Wilson <doug@somethingdoug.com>

Set-Cookie parsing based on https://github.com/nfriedly/set-cookie-parser
Copyright (c) 2015 Nathan Friedly <nathan@nfriedly.com> (http://nfriedly.com/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const trpcIsPlainObjectLicenseText = `is-plain-object vendored by @trpc/server
Upstream package: https://www.npmjs.com/package/is-plain-object
Upstream source: https://github.com/jonschlinkert/is-plain-object

MIT License

Copyright (c) 2014-2017, Jon Schlinkert.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const trpcStandardSchemaLicenseText = `standard-schema vendored by @trpc/server
Upstream package: https://www.npmjs.com/package/@standard-schema/spec
Upstream version inspected for this notice rule: 1.1.0

MIT License

Copyright (c) 2024 Colin McDonnell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

type ExecutableAsset = {
  readonly relativePath: string
  readonly absolutePath: string
  readonly reason: "binary-magic" | "dotslash" | "executable-mode"
}

type PinnedPackageFile = {
  readonly relativePath: string
  readonly sha256: string
}

const anthropicSdkReviewedVersion = "0.100.1"
const anthropicQsLicenseFile = {
  relativePath: "src/internal/qs/LICENSE.md",
  sha256: "d8c77eaffed7f1f874b97f66ee47a557ae24fd59bae8ae14f9b1b84f26a94d2f",
} as const satisfies PinnedPackageFile
const anthropicPartialJsonReadmeFile = {
  relativePath: "src/_vendor/partial-json-parser/README.md",
  sha256: "8ebd95825cacc552b5e29c14451b3ca90bc44da9f43b63b968e6b4cc6535e351",
} as const satisfies PinnedPackageFile
const anthropicPartialJsonParserFile = {
  relativePath: "_vendor/partial-json-parser/parser.mjs",
  sha256: "8b4f6dc5bf130753c72666ee11ef886ab743f7e31ffc90d3cb2a5a1d4fab5fee",
} as const satisfies PinnedPackageFile
const anthropicSdkVendoredFiles = [
  {
    relativePath: "_vendor/partial-json-parser/parser.d.mts",
    sha256: "5aff4efd8609f8fa64fcd4a128cfff5a6d7536771db58ff12b92c4eb9940e657",
  },
  {
    relativePath: "_vendor/partial-json-parser/parser.d.mts.map",
    sha256: "89de9e4fc7eab7e726366bd5cde24fc44d1a0e0cceca7b60d7bdded1d30c5d17",
  },
  {
    relativePath: "_vendor/partial-json-parser/parser.d.ts",
    sha256: "a7b31ba8cc670641a847647d432569eb64810605283f3c891968d157319e7f7e",
  },
  {
    relativePath: "_vendor/partial-json-parser/parser.d.ts.map",
    sha256: "2a1e0201b24288d45af5eeddc2ebf1c34c49829f68363c27a1622989f7812291",
  },
  {
    relativePath: "_vendor/partial-json-parser/parser.js",
    sha256: "7a0b857f57a5d516b124a6d456e4bf466786a3895773a956fd6a61d42795c59d",
  },
  {
    relativePath: "_vendor/partial-json-parser/parser.js.map",
    sha256: "8ee77c9ff49ad1805b542e1d79f40fa6c402367e8e79b4325879dc8d0b625560",
  },
  anthropicPartialJsonParserFile,
  {
    relativePath: "_vendor/partial-json-parser/parser.mjs.map",
    sha256: "ccf4c9ce004e905143b0ce17151f9c142709f3d93a661f8ce8cd5ad63545fda2",
  },
  anthropicPartialJsonReadmeFile,
  {
    relativePath: "src/_vendor/partial-json-parser/parser.ts",
    sha256: "d22c8f4ab90af9803d24f4e5b3ef42c59138c3c78a9cf9415c31232dc1a3a109",
  },
] as const satisfies readonly PinnedPackageFile[]

const trpcServerReviewedVersion = "11.15.0"
const trpcServerUnpromiseLicenseFile = {
  relativePath: "src/vendor/unpromise/LICENSE",
  sha256: "9a16336c25c977661af8e838adfc67de610e17da175f9636226147bb107ae1d6",
} as const satisfies PinnedPackageFile
const trpcServerUnpromiseAttributionFile = {
  relativePath: "src/vendor/unpromise/ATTRIBUTION.txt",
  sha256: "20e592a7cec8e7c0ff277876080e5191a6006e12af247cefafc6a84d9138340d",
} as const satisfies PinnedPackageFile
const trpcServerVendoredFiles = [
  {
    relativePath: "src/vendor/cookie-es/set-cookie/split.ts",
    sha256: "fe57eeee97c3398becd4d0c233b4dc67dec84757a3ceb3720726c150ae594958",
  },
  {
    relativePath: "src/vendor/is-plain-object.ts",
    sha256: "60e9a4f45dd8ec55efec1542e02fbbd77a3b8ead7078a93d25cceda4979fa404",
  },
  {
    relativePath: "src/vendor/standard-schema-v1/error.ts",
    sha256: "801f1cf56185f9777263c613592081cf3e24778101d4dd25e35727c809e12065",
  },
  {
    relativePath: "src/vendor/standard-schema-v1/spec.ts",
    sha256: "6ab77c64f82b11c4b4cbefa507aa9d3e612b8b5527232203c0ffe371c52209ee",
  },
  trpcServerUnpromiseAttributionFile,
  {
    relativePath: "src/vendor/unpromise/index.ts",
    sha256: "3b79161e53149381f2e5d9d50f4fce44cd1690480730bca476748d0f07d3cdd7",
  },
  trpcServerUnpromiseLicenseFile,
  {
    relativePath: "src/vendor/unpromise/types.ts",
    sha256: "98df210420d7cdcf449f2f886e50f7ff9c1f2a7d941714100361fdd893a79a99",
  },
  {
    relativePath: "src/vendor/unpromise/unpromise.ts",
    sha256: "8fe2dc85379c8115bf3a285206fb25de54c9ced423b08c9013fe924be07203d3",
  },
] as const satisfies readonly PinnedPackageFile[]

const trpcElectronReviewedVersion = "0.1.2"
const trpcElectronUnpromiseLicenseFile = {
  relativePath: "src/vendor/unpromise/LICENSE",
  sha256: "9a16336c25c977661af8e838adfc67de610e17da175f9636226147bb107ae1d6",
} as const satisfies PinnedPackageFile
const trpcElectronUnpromiseAttributionFile = {
  relativePath: "src/vendor/unpromise/ATTRIBUTION.txt",
  sha256: "20e592a7cec8e7c0ff277876080e5191a6006e12af247cefafc6a84d9138340d",
} as const satisfies PinnedPackageFile
const trpcElectronVendoredFiles = [
  trpcElectronUnpromiseAttributionFile,
  {
    relativePath: "src/vendor/unpromise/index.ts",
    sha256: "3b79161e53149381f2e5d9d50f4fce44cd1690480730bca476748d0f07d3cdd7",
  },
  trpcElectronUnpromiseLicenseFile,
  {
    relativePath: "src/vendor/unpromise/types.ts",
    sha256: "98df210420d7cdcf449f2f886e50f7ff9c1f2a7d941714100361fdd893a79a99",
  },
  {
    relativePath: "src/vendor/unpromise/unpromise.ts",
    sha256: "8fe2dc85379c8115bf3a285206fb25de54c9ced423b08c9013fe924be07203d3",
  },
] as const satisfies readonly PinnedPackageFile[]

export async function applyPackageInternalAssetRules(options: {
  readonly packageSubjects: readonly PackageNoticeSubject[]
  readonly directSubjects: DirectNoticeSubject[]
  readonly packageExtraText: Map<string, string[]>
  readonly platform: ReleasePlatform
}): Promise<void> {
  for (const subject of options.packageSubjects) {
    const vendoredSurfaces = await detectVendoredSurfaces(subject.packagePath)
    const coveredVendoredSurfaces = await applyNestedNoticeRules(
      subject,
      options.packageExtraText,
      vendoredSurfaces,
    )
    const executableAssets = await detectExecutableAssets(subject.packagePath)

    if (subject.packageName === "@openai/codex") {
      await applyOpenAiCodexRules(
        subject,
        executableAssets,
        vendoredSurfaces,
        coveredVendoredSurfaces,
        options,
      )
      assertVendoredSurfacesCovered(
        subject,
        vendoredSurfaces,
        coveredVendoredSurfaces,
      )
      continue
    }
    if (subject.packageName === "bun") {
      applyBunRuntimePackageRule(
        subject,
        executableAssets,
        options.packageExtraText,
      )
      assertVendoredSurfacesCovered(
        subject,
        vendoredSurfaces,
        coveredVendoredSurfaces,
      )
      continue
    }

    const unexpectedExecutableAssets = executableAssets.filter(
      (asset) => !isPackageTextLauncher(subject.packagePath, asset),
    )
    if (
      runtimeExecutablesCoveredByPackageLicense(
        subject,
        unexpectedExecutableAssets,
      )
    ) {
      appendPackageExtraText(
        subject,
        options.packageExtraText,
        unexpectedExecutableAssets.map(
          (asset) =>
            `Runtime executable included at ${asset.relativePath}; notice coverage is supplied by the ${subject.packageName} package license text.`,
        ),
      )
    } else if (unexpectedExecutableAssets.length > 0) {
      throw new Error(
        `Package ${subject.packageName} contains executable sub-assets without an explicit notice rule: ${unexpectedExecutableAssets.map((asset) => asset.relativePath).join(", ")}`,
      )
    }

    assertVendoredSurfacesCovered(
      subject,
      vendoredSurfaces,
      coveredVendoredSurfaces,
    )
  }
}

function runtimeExecutablesCoveredByPackageLicense(
  subject: PackageNoticeSubject,
  assets: readonly ExecutableAsset[],
): boolean {
  if (assets.length === 0) {
    return false
  }
  return (
    subject.packageName === "app-builder-bin" ||
    subject.packageName === "electron" ||
    subject.packageName.startsWith("@oven/bun-")
  )
}

function applyBunRuntimePackageRule(
  subject: PackageNoticeSubject,
  executableAssets: readonly ExecutableAsset[],
  packageExtraText: Map<string, string[]>,
): void {
  const expectedRuntimeAssets = executableAssets.filter((asset) =>
    /^bin\/bunx?\.exe$/.test(asset.relativePath),
  )
  const unexpected = executableAssets.filter(
    (asset) =>
      !expectedRuntimeAssets.includes(asset) &&
      !isPackageTextLauncher(subject.packagePath, asset),
  )

  if (unexpected.length > 0) {
    throw new Error(
      `Package bun contains executable sub-assets without an explicit notice rule: ${unexpected.map((asset) => asset.relativePath).join(", ")}`,
    )
  }

  appendPackageExtraText(
    subject,
    packageExtraText,
    expectedRuntimeAssets.map(
      (asset) =>
        `Bun package-manager runtime executable included at ${asset.relativePath}; notice coverage is supplied by the bun package license text and the platform Bun runtime package record.`,
    ),
  )
}

function assertPinnedPackageVersion(
  subject: PackageNoticeSubject,
  reviewedVersion: string,
): void {
  if (subject.version !== reviewedVersion) {
    throw new Error(
      `Package ${subject.packageName} version ${subject.version} differs from reviewed version ${reviewedVersion} for explicit vendored notice rule.`,
    )
  }
}

async function readPinnedPackageTextFiles(
  subject: PackageNoticeSubject,
  files: readonly PinnedPackageFile[],
): Promise<string[]> {
  const texts: string[] = []
  for (const file of files) {
    const bytes = await readPinnedPackageFile(subject, file)
    const text = bytes.toString("utf8")
    if (text.trim().length === 0) {
      throw new Error(
        `Required pinned package notice file is empty: ${subject.packageName} ${file.relativePath}`,
      )
    }
    texts.push(text)
  }
  return texts
}

async function assertPinnedPackageFiles(
  subject: PackageNoticeSubject,
  files: readonly PinnedPackageFile[],
): Promise<void> {
  for (const file of files) {
    await readPinnedPackageFile(subject, file)
  }
}

async function readPinnedPackageFile(
  subject: PackageNoticeSubject,
  file: PinnedPackageFile,
): Promise<Buffer> {
  const path = join(subject.packagePath, file.relativePath)
  const bytes = await readFile(path).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      throw new Error(
        `Required pinned package file is missing: ${subject.packageName} ${file.relativePath}`,
      )
    }
    throw error
  })
  if (bytes.length === 0) {
    throw new Error(
      `Required pinned package file is empty: ${subject.packageName} ${file.relativePath}`,
    )
  }

  const actualSha256 = createHash("sha256").update(bytes).digest("hex")
  if (actualSha256 !== file.sha256) {
    throw new Error(
      `Package ${subject.packageName} pinned file ${file.relativePath} has sha256 ${actualSha256}; expected ${file.sha256}.`,
    )
  }
  return bytes
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  )
}

async function applyNestedNoticeRules(
  subject: PackageNoticeSubject,
  packageExtraText: Map<string, string[]>,
  vendoredSurfaces: readonly string[],
): Promise<Set<string>> {
  const coveredVendoredSurfaces = new Set<string>()

  if (subject.packageName === "@anthropic-ai/sdk") {
    assertPinnedPackageVersion(subject, anthropicSdkReviewedVersion)
    const notices = await readPinnedPackageTextFiles(subject, [
      anthropicQsLicenseFile,
      anthropicPartialJsonReadmeFile,
    ])
    await assertPinnedPackageFiles(subject, anthropicSdkVendoredFiles)
    appendPackageExtraText(subject, packageExtraText, [
      ...notices,
      partialJsonParserLicenseText,
    ])
    coverVendoredSurfaces(coveredVendoredSurfaces, vendoredSurfaces, [
      ...anthropicSdkVendoredFiles.map((file) => file.relativePath),
    ])
    return coveredVendoredSurfaces
  }

  if (subject.packageName === "victory-vendor") {
    const victoryVendoredRoots = [
      ...new Set(
        vendoredSurfaces
          .filter((surface) => surface.startsWith("lib-vendor/"))
          .map((surface) => surface.split("/").slice(0, 2).join("/")),
      ),
    ]
    const notices = await readRequiredTextFiles(
      victoryVendoredRoots.map((surface) =>
        join(subject.packagePath, surface, "LICENSE"),
      ),
    )
    appendPackageExtraText(subject, packageExtraText, notices)
    coverVendoredSurfaces(
      coveredVendoredSurfaces,
      vendoredSurfaces,
      victoryVendoredRoots,
    )
    return coveredVendoredSurfaces
  }

  if (subject.packageName === "@trpc/server") {
    assertPinnedPackageVersion(subject, trpcServerReviewedVersion)
    const notices = await readPinnedPackageTextFiles(subject, [
      trpcServerUnpromiseLicenseFile,
      trpcServerUnpromiseAttributionFile,
    ])
    await assertPinnedPackageFiles(subject, trpcServerVendoredFiles)
    appendPackageExtraText(subject, packageExtraText, [
      notices[0] ?? "",
      notices[1] ?? "",
      trpcCookieEsLicenseText,
      trpcIsPlainObjectLicenseText,
      trpcStandardSchemaLicenseText,
    ])
    coverVendoredSurfaces(
      coveredVendoredSurfaces,
      vendoredSurfaces,
      trpcServerVendoredFiles.map((file) => file.relativePath),
    )
    return coveredVendoredSurfaces
  }

  if (subject.packageName === "trpc-electron") {
    assertPinnedPackageVersion(subject, trpcElectronReviewedVersion)
    const notices = await readPinnedPackageTextFiles(subject, [
      trpcElectronUnpromiseLicenseFile,
      trpcElectronUnpromiseAttributionFile,
    ])
    await assertPinnedPackageFiles(subject, trpcElectronVendoredFiles)
    appendPackageExtraText(subject, packageExtraText, notices)
    coverVendoredSurfaces(
      coveredVendoredSurfaces,
      vendoredSurfaces,
      trpcElectronVendoredFiles.map((file) => file.relativePath),
    )
    return coveredVendoredSurfaces
  }

  if (subject.packageName === "electron") {
    const notices = await readRequiredTextFiles([
      join(subject.packagePath, "dist/LICENSE"),
      join(subject.packagePath, "dist/LICENSES.chromium.html"),
    ])
    appendPackageExtraText(subject, packageExtraText, notices)
  }

  return coveredVendoredSurfaces
}

async function applyOpenAiCodexRules(
  subject: PackageNoticeSubject,
  executableAssets: readonly ExecutableAsset[],
  vendoredSurfaces: readonly string[],
  coveredVendoredSurfaces: Set<string>,
  options: {
    readonly directSubjects: DirectNoticeSubject[]
    readonly packageExtraText: Map<string, string[]>
    readonly platform: ReleasePlatform
  },
): Promise<void> {
  const codexAssets = executableAssets.filter((asset) =>
    /(^|\/)vendor\/[^/]+\/codex\/codex(\.exe)?$/.test(asset.relativePath),
  )
  const ripgrepAssets = executableAssets.filter((asset) =>
    /(^|\/)vendor\/[^/]+\/path\/rg(\.exe)?$/.test(asset.relativePath),
  )
  const unexpected = executableAssets.filter(
    (asset) =>
      !codexAssets.includes(asset) &&
      !ripgrepAssets.includes(asset) &&
      !asset.relativePath.startsWith("bin/"),
  )

  if (codexAssets.length > 0) {
    appendPackageExtraText(
      subject,
      options.packageExtraText,
      codexAssets.map(
        (asset) =>
          `Native Codex runtime binary included at ${asset.relativePath}; notice coverage is supplied by the @openai/codex package license text.`,
      ),
    )
    coverVendoredSurfacesForPaths(
      coveredVendoredSurfaces,
      vendoredSurfaces,
      codexAssets.map((asset) => asset.relativePath),
    )
  }

  for (const asset of ripgrepAssets) {
    options.directSubjects.push(
      await resolveRipgrepNoticeSubject(subject, asset, options.platform),
    )
  }
  coverVendoredSurfacesForPaths(
    coveredVendoredSurfaces,
    vendoredSurfaces,
    ripgrepAssets.map((asset) => asset.relativePath),
  )

  if (unexpected.length > 0) {
    throw new Error(
      `@openai/codex contains executable sub-assets without an explicit notice rule: ${unexpected.map((asset) => asset.relativePath).join(", ")}`,
    )
  }
}

async function resolveRipgrepNoticeSubject(
  subject: PackageNoticeSubject,
  asset: ExecutableAsset,
  platform: ReleasePlatform,
): Promise<DirectNoticeSubject> {
  const manifestPath = resolveOpenAiCodexDotslashManifest(
    subject.packagePath,
    subject.version,
  )
  const manifest = parseDotslashManifest(await readFile(manifestPath, "utf8"))
  const platformKey = dotslashPlatformKey(platform)
  const record = manifest.platforms[platformKey]

  if (!record) {
    throw new Error(
      `@openai/codex ripgrep DotSlash manifest has no ${platformKey} platform entry.`,
    )
  }

  const provider = record.providers[0]
  if (!provider) {
    throw new Error("@openai/codex ripgrep DotSlash manifest has no provider.")
  }
  const ripgrepVersion = extractRipgrepVersion(record, provider.url)

  const archiveBytes = await fetchVerifiedArchive(provider.url, record)
  const archivePrefix = dirname(record.path)
  const noticeFiles = ["COPYING", "LICENSE-MIT", "UNLICENSE"]
  const noticeTexts = await readArchiveTextFiles(
    archiveBytes,
    record.format,
    noticeFiles.map((file) => `${archivePrefix}/${file}`),
  )

  return {
    id: `ripgrep:${record.digest}:${asset.relativePath}`,
    kind: "package-sub-asset",
    name: "ripgrep vendored by @openai/codex",
    version: ripgrepVersion,
    licenseExpression: "Unlicense OR MIT",
    source: `@openai/codex ${subject.version} ${asset.relativePath} from ${provider.url}`,
    licenseText: noticeTexts.join("\n\n"),
  }
}

async function detectExecutableAssets(
  packagePath: string,
): Promise<ExecutableAsset[]> {
  const assets: ExecutableAsset[] = []

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name)
      const relativePath = normalizePath(relative(packagePath, absolutePath))

      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        entry.name !== ".git"
      ) {
        await walk(absolutePath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const fileStat = await stat(absolutePath)
      const header = await readFileHeader(absolutePath, 128)
      const reason = executableReason(relativePath, fileStat.mode, header)
      if (reason) {
        assets.push({ relativePath, absolutePath, reason })
      }
    }
  }

  await walk(packagePath)
  return assets
}

function executableReason(
  relativePath: string,
  mode: number,
  header: Buffer,
): ExecutableAsset["reason"] | null {
  const textHeader = header.toString("utf8")
  if (textHeader.startsWith("#!/usr/bin/env dotslash")) {
    return "dotslash"
  }

  if (
    binaryMagicHeaders.some((magic) =>
      magic.every((byte, index) => header[index] === byte),
    )
  ) {
    return "binary-magic"
  }

  if (
    (mode & 0o111) !== 0 &&
    (textHeader.startsWith("#!") || /(^|\/)(bin|vendor)\//.test(relativePath))
  ) {
    return "executable-mode"
  }

  return null
}

function isPackageTextLauncher(
  packagePath: string,
  asset: ExecutableAsset,
): boolean {
  if (asset.reason !== "executable-mode") {
    return false
  }
  const header = readFileSync(join(packagePath, asset.relativePath), "utf8")
  return (
    header.startsWith("#!") && !header.startsWith("#!/usr/bin/env dotslash")
  )
}

async function readFileHeader(path: string, bytes: number): Promise<Buffer> {
  const file = await open(path, "r")
  try {
    const buffer = Buffer.alloc(bytes)
    const result = await file.read(buffer, 0, bytes, 0)
    return buffer.subarray(0, result.bytesRead)
  } finally {
    await file.close()
  }
}

async function detectVendoredSurfaces(packagePath: string): Promise<string[]> {
  const surfaces = new Set<string>()

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > 3) {
      return
    }

    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name)
      const relativePath = normalizePath(relative(packagePath, absolutePath))
      if (entry.isDirectory()) {
        if (isVendoredDirectoryName(entry.name)) {
          await recordVendoredDirectorySurfaces(absolutePath, relativePath)
        }
        if (entry.name !== "node_modules" && entry.name !== ".git") {
          await walk(absolutePath, depth + 1)
        }
      }
    }
  }

  await walk(packagePath, 0)
  return [...surfaces].sort()

  async function recordVendoredDirectorySurfaces(
    directory: string,
    relativeDirectory: string,
  ): Promise<void> {
    let foundFileSurface = false

    async function walkVendoredDirectory(
      currentDirectory: string,
    ): Promise<void> {
      for (const entry of await readdir(currentDirectory, {
        withFileTypes: true,
      })) {
        if (entry.name === "node_modules" || entry.name === ".git") {
          continue
        }

        const absolutePath = join(currentDirectory, entry.name)
        const relativePath = normalizePath(relative(packagePath, absolutePath))
        if (entry.isDirectory()) {
          await walkVendoredDirectory(absolutePath)
          continue
        }
        if (entry.isFile()) {
          foundFileSurface = true
          surfaces.add(relativePath)
        }
      }
    }

    await walkVendoredDirectory(directory)
    if (!foundFileSurface) {
      surfaces.add(relativeDirectory)
    }
  }
}

function isVendoredDirectoryName(name: string): boolean {
  return [
    "_vendor",
    "vendor",
    "vendors",
    "lib-vendor",
    "third_party",
    "third-party",
  ].includes(name)
}

function assertVendoredSurfacesCovered(
  subject: PackageNoticeSubject,
  vendoredSurfaces: readonly string[],
  coveredVendoredSurfaces: ReadonlySet<string>,
): void {
  const uncovered = vendoredSurfaces.filter(
    (surface) => !coveredVendoredSurfaces.has(surface),
  )
  if (uncovered.length > 0) {
    throw new Error(
      `Package ${subject.packageName} contains vendored sub-assets without an explicit notice rule: ${uncovered.join(", ")}`,
    )
  }
}

function coverVendoredSurfaces(
  coveredVendoredSurfaces: Set<string>,
  vendoredSurfaces: readonly string[],
  coverageRoots: readonly string[],
): void {
  for (const surface of vendoredSurfaces) {
    if (
      coverageRoots.some(
        (root) => surface === root || surface.startsWith(`${root}/`),
      )
    ) {
      coveredVendoredSurfaces.add(surface)
    }
  }
}

function coverVendoredSurfacesForPaths(
  coveredVendoredSurfaces: Set<string>,
  vendoredSurfaces: readonly string[],
  paths: readonly string[],
): void {
  coverVendoredSurfaces(coveredVendoredSurfaces, vendoredSurfaces, paths)
}

function appendPackageExtraText(
  subject: PackageNoticeSubject,
  extraText: Map<string, string[]>,
  texts: readonly string[],
): void {
  if (texts.length === 0) {
    return
  }

  const key = packageKey(
    subject.packageName,
    subject.version,
    subject.packagePath,
  )
  const current = extraText.get(key) ?? []
  extraText.set(key, [...current, ...texts])
}
