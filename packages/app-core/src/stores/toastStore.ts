import { create } from "zustand"

export type ToastTone = "info" | "success" | "warning" | "error"

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  message: string
  tone: ToastTone
  durationMs: number
  action?: ToastAction
}

interface ToastState {
  toasts: ToastItem[]
}

interface ToastActions {
  addToast: (
    message: string,
    options?: Partial<Omit<ToastItem, "id" | "message">>,
  ) => string
  removeToast: (id: string) => void
  clearToasts: () => void
}

interface ToastStore extends ToastState, ToastActions {}

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, options) => {
    const id = createId()
    const hasAction = options?.action !== undefined
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id,
          message,
          tone: options?.tone ?? "info",
          durationMs: options?.durationMs ?? (hasAction ? 6000 : 3000),
          action: options?.action,
        },
      ],
    }))
    return id
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  clearToasts: () => set({ toasts: [] }),
}))
