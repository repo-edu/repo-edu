import { create } from "zustand"
import type { ToastAction, ToastItem, ToastTone } from "../types/index.js"

type ToastState = {
  toasts: ToastItem[]
  addToast: (
    message: string,
    options?: {
      tone?: ToastTone
      durationMs?: number
      action?: ToastAction
    },
  ) => string
  removeToast: (id: string) => void
  clearToasts: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, options) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const tone = options?.tone ?? "info"
    const durationMs = options?.durationMs ?? (options?.action ? 6000 : 3000)
    const item: ToastItem = {
      id,
      message,
      tone,
      durationMs,
      action: options?.action,
    }
    set((state) => ({ toasts: [...state.toasts, item] }))
    return id
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  clearToasts: () => {
    set({ toasts: [] })
  },
}))

export const selectToasts = (state: ToastState) => state.toasts
