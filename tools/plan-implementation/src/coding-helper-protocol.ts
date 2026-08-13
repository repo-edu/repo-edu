import { NotificationType, RequestType } from "vscode-jsonrpc"
import type { CodingEvent, CodingRequest, CodingResult } from "./contracts.js"

export type CodingHelperFailure =
  | {
      readonly type: "cancelled"
      readonly message: string
    }
  | {
      readonly type: "helper-error"
      readonly message: string
    }

export const codingHelperRunRequest = new RequestType<
  CodingRequest,
  CodingResult,
  CodingHelperFailure
>("repoEdu/planImplementation/code")

export const codingHelperEventNotification = new NotificationType<CodingEvent>(
  "repoEdu/planImplementation/codingEvent",
)
