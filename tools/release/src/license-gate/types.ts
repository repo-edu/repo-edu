export type LicenseGateApp = "desktop" | "cli"

export type ReleasePlatform =
  | "darwin-arm64"
  | "linux-arm64"
  | "linux-x64"
  | "windows-arm64"
  | "windows-x64"

export type DesktopReleasePlatform = ReleasePlatform

export type CliReleasePlatform = "darwin-arm64" | "linux-arm64" | "linux-x64"

type BaseLicenseGateOptions = {
  readonly artifactTargets: readonly string[]
  readonly manifestOut: string
  readonly root?: string
}

export type DesktopLicenseGateOptions = BaseLicenseGateOptions & {
  readonly app: "desktop"
  readonly platform: DesktopReleasePlatform
}

export type CliLicenseGateOptions = BaseLicenseGateOptions & {
  readonly app: "cli"
  readonly platform: CliReleasePlatform
}

export type LicenseGateOptions =
  | DesktopLicenseGateOptions
  | CliLicenseGateOptions

export type LicenseGateValidationOptions = {
  readonly app: LicenseGateApp
  readonly platform: ReleasePlatform
  readonly artifactTargets: readonly string[]
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
  readonly packageDirectoryExists: boolean
  readonly paths: readonly (readonly string[])[]
  readonly path: readonly string[]
}

export type ProductionDependencyViews = {
  readonly productionReached: readonly ReachedPackage[]
  readonly thirdParty: readonly ReachedPackage[]
}

export type PackageJson = {
  readonly name?: string
  readonly version?: string
  readonly license?: string
  readonly author?: string | { readonly name?: string }
  readonly homepage?: string
  readonly description?: string
}

export type NoticeEntry = {
  readonly id: string
  readonly kind: "package" | "runtime-asset" | "package-sub-asset"
  readonly name: string
  readonly version: string
  readonly licenseExpression: string
  readonly source: string
  readonly licenseText?: string
  readonly licenseEvidence?: string
  readonly noticeText?: string
  readonly additionalText?: string
}

export type ReleaseRuntimeDecision = {
  readonly target: string
  readonly decision: string
}
