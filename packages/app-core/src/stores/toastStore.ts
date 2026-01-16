import { create } from "zustand"

export type ToastTone = "info" | "success" | "warning" | "error"

export interface ToastItem {
  id: string
  message: string
  tone: ToastTone
  durationMs: number
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
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id,
          message,
          tone: options?.tone ?? "info",
          durationMs: options?.durationMs ?? 3000,
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
