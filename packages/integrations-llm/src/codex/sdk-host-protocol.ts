import type {
  CodexLlmProviderRuntimeConfig,
  LlmErrorContext,
  LlmErrorKind,
  LlmModelSpec,
  LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import { NotificationType, RequestType } from "vscode-jsonrpc"

export type CodexSdkHostRunParams = {
  readonly config?: CodexLlmProviderRuntimeConfig
  readonly spec: LlmModelSpec
  readonly prompt: string
}

export type CodexSdkHostRunResult = {
  readonly status: "completed"
}

export type CodexSdkHostProtocolFailure =
  | {
      readonly type: "llm-error"
      readonly kind: LlmErrorKind
      readonly message: string
      readonly context: LlmErrorContext
    }
  | {
      readonly type: "cancelled"
      readonly message: string
    }
  | {
      readonly type: "sdk-host-error"
      readonly message: string
    }

export const codexSdkHostRunRequest = new RequestType<
  CodexSdkHostRunParams,
  CodexSdkHostRunResult,
  CodexSdkHostProtocolFailure
>("repoEdu/codex/run")

export const codexSdkHostEventNotification =
  new NotificationType<LlmStreamEvent>("repoEdu/codex/event")

export const codexSdkHostTraceNotification = new NotificationType<string>(
  "repoEdu/codex/trace",
)
