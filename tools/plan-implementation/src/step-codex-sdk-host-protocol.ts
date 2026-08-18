import { NotificationType, RequestType } from "vscode-jsonrpc"
import type { CodingEvent, CodingRequest, CodingResult } from "./contracts.js"

export type StepCodexSdkHostProtocolFailure =
  | {
      readonly type: "cancelled"
      readonly message: string
    }
  | {
      readonly type: "sdk-host-error"
      readonly message: string
    }

export const stepCodexSdkHostRunRequest = new RequestType<
  CodingRequest,
  CodingResult,
  StepCodexSdkHostProtocolFailure
>("repoEdu/planImplementation/code")

export const stepCodexSdkHostEventNotification =
  new NotificationType<CodingEvent>("repoEdu/planImplementation/codingEvent")
