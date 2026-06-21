declare module "dependency-cruiser" {
  export function cruise(
    files: readonly string[],
    options: Record<string, unknown>,
    resolveOptions: Record<string, unknown>,
    transpileOptions: Record<string, unknown>,
  ): Promise<{ readonly output: unknown; readonly exitCode: number }>
}
