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
    id: "posix-child-process-lifetime-adapter",
    file: "packages/host-node/src/posix-child-process-lifetime-adapter.ts",
    mechanism: "node-child-process",
    targetRoute: "direct-adapter",
    launches: [
      "POSIX Git commands",
      "POSIX ProcessPort tool commands",
      "POSIX Claude CLI",
      "POSIX managed-helper entries",
    ],
  },
  {
    id: "windows-launcher-host",
    file: "packages/host-node/src/windows-child-process-lifetime-adapter.ts",
    mechanism: "node-child-process",
    targetRoute: "direct-adapter",
    launches: ["fixed inert Windows launcher"],
  },
  {
    id: "windows-assigned-target",
    file: "packages/host-node/resources/host-child-lifetime/windows-launcher.cjs",
    mechanism: "node-child-process",
    targetRoute: "direct-adapter",
    launches: [
      "Windows Git commands",
      "Windows ProcessPort tool commands",
      "Windows Claude CLI",
      "Windows managed-helper entries",
    ],
  },
  {
    id: "codex-sdk",
    file: "packages/integrations-llm/src/codex/runner.ts",
    mechanism: "codex-sdk",
    targetRoute: "managed-helper",
    launches: ["Codex SDK child", "Codex tool descendants"],
  },
] as const satisfies readonly ProductProcessLaunch[]
