import { AlertTriangle, Check, CloudUpload, Loader2, RotateCw, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { insert, remove } from '../../domain/changes'
import { newNote } from '../../domain/factories'
import { cn } from '../../lib/cn'
import { act } from '../../state/actions'
import { confirm } from '../../state/confirm'
import type { NoteSaverState } from '../../state/noteSaver'
import { useStore } from '../../state/store'
import { toast } from '../../state/toasts'
import { Markdown } from '../Markdown'
import { Button } from '../ui/button'
import { Input, Textarea } from '../ui/field'
import { Segmented } from '../ui/misc'
import { useNoteSaver } from './useNoteSaver'

const PROMPTS = ['What I learned', 'Questions', 'Next step']

function StatusChip({ state, onRetry }: { state: NoteSaverState; onRetry: () => void }) {
  const base = 'inline-flex items-center gap-1 text-[12px]'
  switch (state.status) {
    case 'saving':
      return <span role="status" className={cn(base, 'text-muted')}><Loader2 className="size-3 animate-spin motion-reduce:animate-none" /> Saving…</span>
    case 'saved':
      return <span role="status" className={cn(base, 'text-success')}><Check className="size-3" /> Saved</span>
    case 'dirty':
      return <span role="status" className={cn(base, 'text-muted')}><CloudUpload className="size-3" /> Unsaved changes</span>
    case 'error':
      return (
        <span role="alert" className={cn(base, 'text-danger')}>
          <AlertTriangle className="size-3" /> Not saved — kept in this browser.
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-0.5 font-semibold underline">
            <RotateCw className="size-3" /> Retry
          </button>
        </span>
      )
    case 'conflict':
      return <span role="alert" className={cn(base, 'text-warn')}><AlertTriangle className="size-3" /> Edit conflict</span>
    default:
      return null
  }
}

interface NoteEditorProps {
  noteId: string
  autoFocus?: boolean
  onDeleted?: () => void
}

export function NoteEditor({ noteId, autoFocus, onDeleted }: NoteEditorProps) {
  const { note, state, saver } = useNoteSaver(noteId)
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const textRef = useRef<HTMLTextAreaElement>(null)
  const ctx = useStore((s) => s.ctx)

  if (!note || !state || !saver) return null

  const insertPrompt = (prompt: string) => {
    const body = state.body.trimEnd()
    const next = `${body}${body ? '\n\n' : ''}## ${prompt}\n`
    saver.edit({ body: next })
    setMode('write')
    requestAnimationFrame(() => {
      const el = textRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(next.length, next.length)
      }
    })
  }

  const saveCopy = async () => {
    const copy = newNote(ctx, {
      title: `${state.title || 'Untitled'} (my version)`, body: state.body,
      session_id: note.session_id, topic_id: note.topic_id, date: note.date,
    })
    await act([insert('notes', [copy])])
    if (state.conflict) saver.useTheirs()
    else saver.discardDraft(note)
    toast('Saved your version as a separate note.')
  }

  const deleteNote = async () => {
    const ok = await confirm({
      title: 'Delete this note?',
      body: 'The note text will be removed. You can undo right after.',
      confirmLabel: 'Delete note',
      destructive: true,
    })
    if (!ok) return
    saver.discardDraft(note)
    await act([remove('notes', [note])], { label: 'Note deleted' })
    onDeleted?.()
  }

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Input
          aria-label="Note title"
          placeholder="Untitled note"
          value={state.title}
          onChange={(e) => saver.edit({ title: e.target.value })}
          onBlur={() => void saver.save()}
          className="h-7 min-w-40 flex-1 basis-48 border-transparent bg-transparent px-1 font-medium hover:border-line"
        />
        <StatusChip state={state} onRetry={() => void saver.save()} />
        <Segmented
          label="Editor mode"
          value={mode}
          onChange={setMode}
          options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]}
        />
        <Button variant="ghost" size="icon-sm" aria-label="Delete note" onClick={() => void deleteNote()}>
          <Trash2 />
        </Button>
      </div>

      {state.recoveredDraft && state.status !== 'conflict' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-3 py-2 text-[12.5px]">
          <span className="flex-1">Restored unsaved text from this browser. It will save automatically.</span>
          <Button size="sm" variant="ghost" onClick={() => saver.discardDraft(note)}>Discard draft</Button>
        </div>
      )}

      {state.status === 'conflict' && (
        <div role="alert" className="space-y-2 border-b border-line bg-warn-soft px-3 py-2.5 text-[13px]">
          <p className="font-medium text-warn">
            {state.serverMissing
              ? 'This note was deleted on another device. Your text is still here.'
              : 'This note was changed on another device since you opened it. Nothing has been overwritten.'}
          </p>
          {state.conflict && (
            <details className="rounded border border-line bg-surface p-2">
              <summary className="cursor-pointer text-[12.5px] text-muted">Show the other version</summary>
              <pre className="mt-2 max-h-48 overflow-auto font-sans text-[12.5px] whitespace-pre-wrap">{state.conflict.body || '(empty)'}</pre>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            {state.conflict && (
              <>
                <Button size="sm" onClick={() => void saver.keepMine()}>Keep mine (replace other)</Button>
                <Button size="sm" onClick={() => saver.useTheirs()}>Use other (discard mine)</Button>
              </>
            )}
            <Button size="sm" variant="primary" onClick={() => void saveCopy()}>Keep both (save mine separately)</Button>
          </div>
        </div>
      )}

      {mode === 'write' ? (
        <Textarea
          ref={textRef}
          aria-label="Note text (Markdown supported)"
          autoFocus={autoFocus}
          value={state.body}
          placeholder="Write freely. Markdown, links and ``` code blocks ``` work."
          onChange={(e) => saver.edit({ body: e.target.value })}
          onBlur={() => void saver.save()}
          rows={8}
          className="min-h-40 rounded-none border-0 bg-transparent font-[inherit] focus:border-0"
        />
      ) : (
        <div className="min-h-40 px-3 py-2.5">
          {state.body.trim() ? <Markdown source={state.body} /> : <p className="text-sm text-faint">Nothing to preview yet.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-1.5">
        <span className="text-[12px] text-faint">Optional prompts:</span>
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => insertPrompt(p)}
            className="rounded px-1.5 py-0.5 text-[12px] text-muted hover:bg-surface-2 hover:text-fg"
          >
            + {p}
          </button>
        ))}
        <span className="ml-auto text-[11.5px] text-faint" title={note.created_at}>
          Created {new Date(note.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}
