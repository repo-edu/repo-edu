export type ProductProcessLaunchOwner =
  | "platform-adapter"
  | "codex-sdk-host-process"

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
  readonly launchOwner: ProductProcessLaunchOwner
  readonly launches: readonly string[]
}

export const productProcessLaunchInventory = [
  {
    id: "posix-child-process-lifetime-adapter",
    file: "packages/host-node/src/posix-child-process-lifetime-adapter.ts",
    mechanism: "node-child-process",
    launchOwner: "platform-adapter",
    launches: [
      "POSIX Git commands",
      "POSIX ProcessPort tool commands",
      "POSIX Claude CLI",
      "POSIX Codex SDK host process entries",
    ],
  },
  {
    id: "windows-launcher-host",
    file: "packages/host-node/src/windows-child-process-lifetime-adapter.ts",
    mechanism: "node-child-process",
    launchOwner: "platform-adapter",
    launches: ["fixed inert Windows launcher"],
  },
  {
    id: "windows-assigned-target",
    file: "packages/host-node/resources/host-child-lifetime/windows-launcher.cjs",
    mechanism: "node-child-process",
    launchOwner: "platform-adapter",
    launches: [
      "Windows Git commands",
      "Windows ProcessPort tool commands",
      "Windows Claude CLI",
      "Windows Codex SDK host process entries",
    ],
  },
  {
    id: "codex-sdk",
    file: "packages/integrations-llm/src/codex/runner.ts",
    mechanism: "codex-sdk",
    launchOwner: "codex-sdk-host-process",
    launches: ["Codex process", "Codex tool descendants"],
  },
] as const satisfies readonly ProductProcessLaunch[]
