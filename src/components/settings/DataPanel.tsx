import { Download, FileUp, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { countRows, makeBackup, mergeSnapshots, notesToMarkdown, parseBackup, remapIds, type ImportSummary } from '../../domain/backup'
import { TABLE_ORDER, type Snapshot } from '../../domain/types'
import { describeError, RepoError } from '../../data/repository'
import { markBackedUp } from '../../lib/backupReminder'
import { downloadText } from '../../lib/download'
import { confirm } from '../../state/confirm'
import { getOutbox, useStore } from '../../state/store'
import { toast, toastError } from '../../state/toasts'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Checkbox } from '../ui/field'
import { Segmented } from '../ui/misc'

const LABELS: Record<string, string> = {
  settings: 'Settings', goals: 'Goals', tracks: 'Tracks', stages: 'Stages', topics: 'Topics', checkpoints: 'Checkpoints',
  session_templates: 'Templates', sessions: 'Sessions', tasks: 'Tasks', resources: 'Resources', session_resources: 'Resource links',
  notes: 'Notes', recurring_blocks: 'Recurring blocks', blocks: 'Calendar blocks',
}

const MAX_BYTES = 20 * 1024 * 1024

function stamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
}

export function exportJson(data: Snapshot): void {
  downloadText(`study-planner-backup-${stamp()}.json`, JSON.stringify(makeBackup(data), null, 2))
  markBackedUp()
}

interface Pending {
  fileName: string
  snapshot: Snapshot
  warnings: string[]
  exportedAt: string | null
}

/** `importOnly` is used on the setup screen to restore an existing backup into a new workspace. */
export function DataPanel({ importOnly = false }: { importOnly?: boolean }) {
  const data = useStore((s) => s.data)
  const replaceAll = useStore((s) => s.replaceAll)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [errors, setErrors] = useState<string[] | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [backupFirst, setBackupFirst] = useState(!importOnly)
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File | undefined) => {
    setErrors(null)
    if (!file) return
    if (file.size > MAX_BYTES) return setErrors(['That file is larger than 20 MB, which is too big for a planner backup.'])
    const result = parseBackup(await file.text())
    if (!result.ok) return setErrors(result.errors)
    setMode('merge')
    setPending({ fileName: file.name, snapshot: result.snapshot, warnings: result.warnings, exportedAt: result.exportedAt })
  }

  const merged = pending ? mergeSnapshots(data, pending.snapshot) : null
  const incoming = pending ? countRows(pending.snapshot) : null
  const current = countRows(data)

  const runImport = async () => {
    if (!pending || !merged) return
    if (mode === 'replace') {
      const ok = await confirm({
        title: 'Replace all your data?',
        body: 'Everything currently in your planner will be deleted and replaced by this backup. This cannot be undone from inside the app.',
        confirmLabel: 'Replace everything',
        destructive: true,
        typeToConfirm: 'REPLACE',
      })
      if (!ok) return
    }
    if (backupFirst) exportJson(data)
    setBusy(true)
    try {
      await importSnapshot(pending.snapshot)
      toast(mode === 'replace' ? 'Backup restored.' : 'Backup merged.')
      setPending(null)
    } catch (e) {
      if (e instanceof RepoError && e.code === '23505') {
        // The ids already exist in the database under another account.
        const ok = await confirm({
          title: 'This backup belongs to another account',
          body: 'Its records already exist elsewhere, so they can’t be restored with the same ids. Import them as an independent copy with new ids? All relationships are kept.',
          confirmLabel: 'Import as a copy',
        })
        if (ok) {
          try {
            await importSnapshot(remapIds(pending.snapshot))
            toast('Backup imported as a copy.')
            setPending(null)
          } catch (e2) {
            toastError(`Import failed — nothing was changed. ${describeError(e2)}`)
          }
        }
      } else {
        toastError(`Import failed — nothing was changed. ${describeError(e)}`)
      }
    } finally {
      setBusy(false)
    }
  }

  /** Merge is computed against freshly loaded server data, never a stale in-memory copy. */
  const importSnapshot = async (incomingSnap: Snapshot) => {
    const repo = useStore.getState().repo
    if (!repo) throw new Error('Not ready')
    await getOutbox()?.whenIdle()
    const fresh = await repo.loadAll()
    const target = mode === 'replace'
      ? { ...incomingSnap, settings: incomingSnap.settings.length ? incomingSnap.settings.map((s) => ({ ...s, onboarded: true })) : fresh.settings }
      : mergeSnapshots(fresh, incomingSnap).snapshot
    await replaceAll(target)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {!importOnly && (
          <>
            <Button variant="primary" onClick={() => exportJson(data)}><Download /> Export full backup (JSON)</Button>
            <Button onClick={() => downloadText(`study-notes-${stamp()}.md`, notesToMarkdown(data), 'text/markdown')} disabled={data.notes.length === 0}>
              <Download /> Export notes (Markdown)
            </Button>
          </>
        )}
        <Button onClick={() => fileRef.current?.click()}><Upload /> {importOnly ? 'Restore from a backup…' : 'Import backup…'}</Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose backup file"
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {errors && (
        <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <p className="font-medium">This file can’t be imported:</p>
          <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      {pending && incoming && merged && (
        <Dialog
          open
          size="lg"
          onOpenChange={(o) => !o && !busy && setPending(null)}
          title="Import preview"
          description={`${pending.fileName}${pending.exportedAt ? ` · exported ${new Date(pending.exportedAt).toLocaleString()}` : ''}`}
          footer={
            <>
              <Button onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
              <Button variant={mode === 'replace' ? 'danger' : 'primary'} onClick={() => void runImport()} disabled={busy}>
                <FileUp /> {busy ? 'Importing…' : mode === 'replace' ? 'Replace my data' : 'Merge into my data'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Segmented
              label="Import mode"
              value={mode}
              onChange={setMode}
              options={[{ value: 'merge', label: 'Merge (keep my data)' }, { value: 'replace', label: 'Replace everything' }]}
            />
            <p className="text-[13px] text-muted">
              {mode === 'merge'
                ? 'Records are matched by id. New records are added; where both copies exist, the more recently updated one wins. Nothing is deleted, and your settings are kept.'
                : 'Your current data is deleted and replaced by the backup in one step. If anything fails, nothing changes.'}
            </p>
            <table className="w-full text-[13px]">
              <thead className="text-left text-[12px] text-muted">
                <tr>
                  <th className="pb-1 font-medium">Records</th>
                  <th className="pb-1 font-medium">Now</th>
                  <th className="pb-1 font-medium">In file</th>
                  <th className="pb-1 font-medium">{mode === 'merge' ? 'Added / updated' : 'After'}</th>
                </tr>
              </thead>
              <tbody>
                {TABLE_ORDER.filter((t) => current[t] || incoming[t]).map((t) => {
                  const s = merged.summary.find((x: ImportSummary) => x.table === t)
                  return (
                    <tr key={t} className="border-t border-line">
                      <td className="py-1">{LABELS[t]}</td>
                      <td className="py-1 tabular-nums">{current[t]}</td>
                      <td className="py-1 tabular-nums">{incoming[t]}</td>
                      <td className="py-1 tabular-nums">{mode === 'merge' ? `${s?.added ?? 0} / ${s?.updated ?? 0}` : incoming[t] || (t === 'settings' ? current[t] : 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {pending.warnings.length > 0 && (
              <div className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
                <p className="font-medium">Repaired while validating:</p>
                <ul className="mt-1 list-disc pl-5">{pending.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            )}
            <Checkbox label="Download a backup of my current data first" checked={backupFirst} onChange={(e) => setBackupFirst(e.target.checked)} />
          </div>
        </Dialog>
      )}
    </div>
  )
}
