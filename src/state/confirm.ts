import type { ReactNode } from 'react'
import { create } from 'zustand'

export interface ConfirmRequest {
  title: string
  body: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Require typing this word before the confirm button enables. */
  typeToConfirm?: string
}

interface ConfirmState {
  request: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null
  ask: (req: ConfirmRequest) => Promise<boolean>
  settle: (ok: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  ask: (req) =>
    new Promise<boolean>((resolve) => {
      get().request?.resolve(false)
      set({ request: { ...req, resolve } })
    }),
  settle: (ok) => {
    get().request?.resolve(ok)
    set({ request: null })
  },
}))

export function confirm(req: ConfirmRequest): Promise<boolean> {
  return useConfirmStore.getState().ask(req)
}
