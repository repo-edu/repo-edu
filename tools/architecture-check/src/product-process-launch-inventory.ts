export type ProductProcessRoute = "direct-adapter" | "managed-helper"

export type ProductProcessMechanism =
  | "bun-process"
  | "claude-agent-sdk"
  | "codex-sdk"
  | "cross-spawn"
  | "deno-command"
  | "execa"
  | "node-child-process"
  | "node-cluster"

type ProductProcessLaunch = {
  readonly id: string
  readonly file: string
  readonly mechanism: ProductProcessMechanism
  readonly targetRoute: ProductProcessRoute
  readonly launches: readonly string[]
}

export const productProcessLaunchInventory = [
  {
    id: "child-lifetime-adapter",
    file: "packages/host-node/src/child-process-lifetime.ts",
    mechanism: "node-child-process",
    targetRoute: "direct-adapter",
    launches: ["POSIX direct targets and managed-helper entries"],
  },
  {
    id: "node-process-port",
    file: "packages/host-node/src/index.ts",
    mechanism: "node-child-process",
    targetRoute: "direct-adapter",
    launches: ["Git commands", "ProcessPort tool commands"],
  },
  {
    id: "windows-launcher-host",
    file: "packages/host-node/src/windows-child-lifetime.ts",
    mechanism: "node-child-process",
    targetRoute: "direct-adapter",
    launches: ["fixed inert Windows launcher"],
  },
  {
    id: "windows-assigned-target",
    file: "apps/desktop/resources/host-child-lifetime/windows-launcher.cjs",
    mechanism: "node-child-process",
    targetRoute: "direct-adapter",
    launches: ["target admitted after Windows job assignment"],
  },
  {
    id: "claude-cli",
    file: "packages/integrations-llm/src/claude/cli-runner.ts",
    mechanism: "node-child-process",
    targetRoute: "direct-adapter",
    launches: ["Claude CLI"],
  },
  {
    id: "codex-sdk",
    file: "packages/integrations-llm/src/codex/runner.ts",
    mechanism: "codex-sdk",
    targetRoute: "managed-helper",
    launches: ["Codex SDK child", "Codex tool descendants"],
  },
] as const satisfies readonly ProductProcessLaunch[]
