export type RendererCloseHandler = (requestId: string) => Promise<void>

export type RendererCloseResponse = {
  requestId: string
  ok: boolean
  message?: string
}

export async function invokeRendererCloseHandler(
  handler: RendererCloseHandler | null,
  requestId: string,
): Promise<RendererCloseResponse> {
  if (handler === null) {
    return {
      requestId,
      ok: false,
      message: "The renderer session is not ready to close.",
    }
  }

  try {
    await handler(requestId)
    return { requestId, ok: true }
  } catch (error) {
    return {
      requestId,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
