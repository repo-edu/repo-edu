import type {
  CodexLlmProviderRuntimeConfig,
  LlmErrorContext,
  LlmErrorKind,
  LlmModelSpec,
  LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import { NotificationType, RequestType } from "vscode-jsonrpc"

export type CodexHelperRunParams = {
  readonly config?: CodexLlmProviderRuntimeConfig
  readonly spec: LlmModelSpec
  readonly prompt: string
}

export type CodexHelperRunResult = {
  readonly status: "completed"
}

export type CodexHelperFailure =
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
      readonly type: "helper-error"
      readonly message: string
    }

export const codexHelperRunRequest = new RequestType<
  CodexHelperRunParams,
  CodexHelperRunResult,
  CodexHelperFailure
>("repoEdu/codex/run")

export const codexHelperEventNotification =
  new NotificationType<LlmStreamEvent>("repoEdu/codex/event")

export const codexHelperTraceNotification = new NotificationType<string>(
  "repoEdu/codex/trace",
)
