import { AlertTriangle, CheckCircle2, CloudOff, Info, Loader2, RotateCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'
import { useConfirmStore } from '../state/confirm'
import { useStore } from '../state/store'
import { useToasts } from '../state/toasts'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Input } from './ui/field'

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-5 lg:items-end lg:pr-5"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border bg-surface px-3.5 py-2.5 text-[13px] shadow-panel animate-fade-in',
            t.tone === 'error' ? 'border-danger/40' : 'border-line',
          )}
        >
          {t.tone === 'error' ? <AlertTriangle className="size-4 shrink-0 text-danger" /> : <Info className="size-4 shrink-0 text-muted" />}
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="font-semibold text-accent hover:underline"
              onClick={() => {
                t.action?.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" className="text-faint hover:text-fg" onClick={() => dismiss(t.id)}>
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request)
  const settle = useConfirmStore((s) => s.settle)
  const [typed, setTyped] = useState('')
  useEffect(() => setTyped(''), [request])
  if (!request) return null
  const blocked = request.typeToConfirm != null && typed.trim() !== request.typeToConfirm
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && settle(false)}
      title={request.title}
      size="sm"
      footer={
        <>
          <Button onClick={() => settle(false)}>{request.cancelLabel ?? 'Cancel'}</Button>
          <Button variant={request.destructive ? 'danger' : 'primary'} disabled={blocked} onClick={() => settle(true)}>
            {request.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-muted">
        <div>{request.body}</div>
        {request.typeToConfirm && (
          <label className="block space-y-1">
            <span className="text-[13px]">
              Type <strong className="font-mono text-fg">{request.typeToConfirm}</strong> to confirm
            </span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </label>
        )}
      </div>
    </Dialog>
  )
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Honest save status for structural changes; notes show their own status. */
export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const sync = useStore((s) => s.sync)
  const mode = useStore((s) => s.repo?.mode)
  const retry = useStore((s) => s.retrySync)
  const discard = useStore((s) => s.discardUnsaved)
  const online = useOnline()
  const where = mode === 'demo' ? 'this browser' : 'the cloud'

  if (sync.failed && compact) {
    return (
      <div role="alert" className="flex items-center gap-2 text-[12.5px] text-danger">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1" title={sync.failed}>{sync.pending} unsaved</span>
        <Button size="sm" variant="secondary" onClick={retry}><RotateCw /> Retry</Button>
      </div>
    )
  }
  if (sync.failed) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-danger-soft px-2.5 py-1.5 text-[12.5px] text-danger">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          {sync.pending} change{sync.pending === 1 ? '' : 's'} not saved. {sync.failed}
        </span>
        <span className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={retry}>
            <RotateCw /> Retry
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void discard()} title="Discard unsaved changes and reload saved data">
            Discard
          </Button>
        </span>
      </div>
    )
  }
  if (!online && mode === 'cloud') {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-[12.5px] text-warn">
        <CloudOff className="size-3.5" /> Offline — changes will fail to save
      </span>
    )
  }
  if (sync.saving || sync.pending > 0) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> Saving…
      </span>
    )
  }
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-[12.5px] text-faint">
      <CheckCircle2 className="size-3.5" /> Saved to {where}
    </span>
  )
}

export function DemoBanner() {
  const mode = useStore((s) => s.repo?.mode)
  if (mode !== 'demo') return null
  return (
    <div className="border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-center text-[12.5px] text-warn">
      <strong className="font-semibold">Local demo mode.</strong> Supabase isn’t configured, so data is stored only in
      this browser and is not synced or backed up. Export a backup from Settings to keep it.
    </div>
  )
}
