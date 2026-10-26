import { create } from 'zustand'

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
  action?: { label: string; run: () => void }
}

interface ToastState {
  toasts: Toast[]
  show: (t: Omit<Toast, 'id'>, ms?: number) => number
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  show: (t, ms = 6000) => {
    const id = nextId++
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] })
    if (ms > 0) setTimeout(() => get().dismiss(id), ms)
    return id
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export function toast(message: string, action?: Toast['action']): void {
  useToasts.getState().show({ message, tone: 'info', action })
}

export function toastError(message: string, action?: Toast['action']): void {
  useToasts.getState().show({ message, tone: 'error', action }, 10000)
}
