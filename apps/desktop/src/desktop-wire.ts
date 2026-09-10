import type { OrdinaryWorkflowId } from "@repo-edu/application-contract"
import { appAppearanceSchema } from "@repo-edu/domain/settings"
import { fileFormats } from "@repo-edu/domain/types"
import type { TRPCResponseMessage } from "@trpc/server/rpc"
import { z } from "zod"
import { desktopTrpcWorkflowIds } from "./host-entry-inventory"
import { commandIntentSchema } from "./request-port-wire"

export const desktopEntryChannel = "repo-edu/entry"
export const desktopTrpcResponseChannel = "repo-edu/trpc-response"

const callId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
// An exclusive command id on this wire is a malformed envelope.
const workflowId = z.enum(
  desktopTrpcWorkflowIds as [OrdinaryWorkflowId, ...OrdinaryWorkflowId[]],
)

export const desktopTrpcMessageSchema = z.discriminatedUnion("method", [
  z.strictObject({
    id: callId,
    method: z.literal("subscription"),
    params: z.strictObject({ path: workflowId, input: z.unknown() }),
  }),
  z.strictObject({ id: callId, method: z.literal("subscription.stop") }),
])

export const desktopEntryMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("trpc"),
    message: desktopTrpcMessageSchema,
  }),
  commandIntentSchema,
])

const fileFormat = z.enum(fileFormats)
export const desktopDirectMessageSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("bootstrapReady") }),
  z.strictObject({
    action: z.literal("pickUserFile"),
    input: z
      .strictObject({
        title: z.string().optional(),
        acceptFormats: z.array(fileFormat).optional(),
      })
      .optional(),
  }),
  z.strictObject({
    action: z.literal("pickSaveTarget"),
    input: z
      .strictObject({
        title: z.string().optional(),
        suggestedName: z.string().optional(),
        defaultFormat: fileFormat.optional(),
      })
      .optional(),
  }),
  z.strictObject({
    action: z.literal("pickDirectory"),
    input: z.strictObject({ title: z.string().optional() }).optional(),
  }),
  z.strictObject({
    action: z.literal("setNativeTheme"),
    input: appAppearanceSchema.shape.theme,
  }),
  z.strictObject({ action: z.literal("downloadUpdate") }),
  z.strictObject({ action: z.literal("quitAndInstall") }),
])

export type DesktopTrpcMessage = z.infer<typeof desktopTrpcMessageSchema>
export type DesktopDirectMessage = z.infer<typeof desktopDirectMessageSchema>

/** Electron structured clone preserves workflow Maps and undefined values. */
export type DesktopTrpcBridge = {
  send(message: DesktopTrpcMessage): void
  subscribe(handler: (message: TRPCResponseMessage) => void): () => void
}

declare global {
  interface Window {
    repoEduTrpc?: DesktopTrpcBridge
  }
}
