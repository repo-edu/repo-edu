export const windowsLauncherProtocolVersion = 3

export type WindowsChildLifetimeTarget = {
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<NodeJS.ProcessEnv>
}

export type WindowsLauncherReadyMessage = {
  readonly kind: "ready"
  readonly protocolVersion: number
  readonly runtime: "node"
}

export type WindowsLauncherStartedMessage = {
  readonly kind: "started"
}

export type WindowsLauncherExitedMessage = {
  readonly kind: "exited"
  readonly exitCode: number | null
  readonly signal: string | null
}

export type WindowsLauncherTerminalMessage = {
  readonly kind: "terminal"
  readonly exitCode: number | null
  readonly signal: string | null
}

export type WindowsLauncherFailureMessage = {
  readonly kind: "failure"
  readonly message: string
}

export type WindowsLauncherMessage =
  | WindowsLauncherReadyMessage
  | WindowsLauncherStartedMessage
  | WindowsLauncherExitedMessage
  | WindowsLauncherTerminalMessage
  | WindowsLauncherFailureMessage

// A supplied environment is the whole target environment, never a set of
// changes laid over the host's. Only an absent environment falls back to the
// host's own, which is what Node does for a plain spawn.
function buildTargetEnvironment(
  env: Readonly<NodeJS.ProcessEnv> | undefined,
): Record<string, string> {
  const environment: Record<string, string> = {}
  for (const [name, value] of Object.entries(env ?? process.env)) {
    if (value !== undefined) {
      environment[name] = value
    }
  }
  return environment
}

export function createWindowsLaunchCommand(target: WindowsChildLifetimeTarget) {
  return {
    kind: "launch",
    protocolVersion: windowsLauncherProtocolVersion,
    target: {
      command: target.command,
      args: [...(target.args ?? [])],
      cwd: target.cwd,
      env: buildTargetEnvironment(target.env),
    },
  } as const
}

export function parseWindowsLauncherMessage(
  line: string,
): WindowsLauncherMessage {
  const value = JSON.parse(line) as Partial<WindowsLauncherMessage>
  if (value.kind === "ready") {
    if (
      value.protocolVersion !== windowsLauncherProtocolVersion ||
      value.runtime !== "node"
    ) {
      throw new Error("The Windows launcher reported an invalid ready state.")
    }
    return value as WindowsLauncherReadyMessage
  }
  if (value.kind === "started") {
    return value as WindowsLauncherStartedMessage
  }
  if (value.kind === "exited" || value.kind === "terminal") {
    if (
      !(
        value.exitCode === null ||
        (typeof value.exitCode === "number" &&
          Number.isSafeInteger(value.exitCode))
      ) ||
      !(value.signal === null || typeof value.signal === "string")
    ) {
      throw new Error(
        `The Windows launcher reported an invalid ${value.kind} state.`,
      )
    }
    return value as
      | WindowsLauncherExitedMessage
      | WindowsLauncherTerminalMessage
  }
  if (value.kind === "failure" && typeof value.message === "string") {
    return value as WindowsLauncherFailureMessage
  }
  throw new Error("The Windows launcher reported an unknown control message.")
}
