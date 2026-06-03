export type LicenseGateApp = "desktop" | "cli"

export type ReleasePlatform =
  | "darwin-arm64"
  | "linux-arm64"
  | "linux-x64"
  | "windows-arm64"
  | "windows-x64"

export type LicenseGateOptions = {
  readonly app: LicenseGateApp
  readonly platform: ReleasePlatform
  readonly artifactTargets: readonly string[]
  readonly manifestOut: string
  readonly bunMetafile?: string
  readonly desktopBundleManifest?: string
  readonly root?: string
}

export type PnpmListNode = {
  readonly name?: string
  readonly from?: string
  readonly version?: string
  readonly path?: string
  readonly resolved?: string
  readonly private?: boolean
  readonly deduped?: boolean
  readonly dedupedDependenciesCount?: number
  readonly dependencies?: Record<string, PnpmListNode>
  readonly unsavedDependencies?: Record<string, PnpmListNode>
}

export type ReachedPackage = {
  readonly reachedName: string
  readonly packageName: string
  readonly version: string
  readonly packagePath: string
  readonly firstParty: boolean
  readonly path: readonly string[]
}

export type PackageClosure = {
  readonly firstPartyPackages: readonly ReachedPackage[]
  readonly externalPackages: readonly ReachedPackage[]
}

export type PackageJson = {
  readonly name?: string
  readonly version?: string
  readonly license?: string
  readonly author?: string | { readonly name?: string }
  readonly homepage?: string
  readonly description?: string
}

export type LicenseMetadataRecord = {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly license: string
  readonly author?: string
  readonly homepage?: string
  readonly description?: string
}

export type PackageNoticeSubject = ReachedPackage & {
  readonly kind: "package" | "runtime-asset"
  readonly source: string
}

export type DirectNoticeSubject = {
  readonly id: string
  readonly kind: "runtime-asset" | "package-sub-asset"
  readonly name: string
  readonly version: string
  readonly licenseExpression: string
  readonly source: string
  readonly licenseText: string
  readonly noticeText?: string
}

export type ReleaseRuntimeDecision = {
  readonly target: string
  readonly decision: string
}
