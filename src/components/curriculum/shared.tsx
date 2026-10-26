import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react'
import type { Change } from '../../domain/changes'
import { act } from '../../state/actions'
import { confirm } from '../../state/confirm'
import type { MenuItem } from '../ui/menu'

/** Explains what a deletion affects before doing it; suggests archiving when anything is linked. */
export async function deleteWithConsequences(name: string, consequences: string[], changes: Change[]): Promise<void> {
  const ok = await confirm({
    title: `Delete “${name}”?`,
    body: consequences.length ? (
      <div className="space-y-2">
        <p>This is linked to other records:</p>
        <ul className="list-disc space-y-0.5 pl-5">{consequences.map((c) => <li key={c}>{c}</li>)}</ul>
        <p>Archiving hides it but keeps every connection. Delete only if you’re sure.</p>
      </div>
    ) : (
      'Nothing else is linked to it.'
    ),
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (ok) await act(changes, { label: `Deleted “${name}”` })
}

interface RowActions {
  onEdit?: () => void
  onUp?: () => void
  onDown?: () => void
  first?: boolean
  last?: boolean
  archived: boolean
  onArchive: () => void
  onDelete: () => void
  extra?: MenuItem[]
}

export function rowMenu(a: RowActions): MenuItem[] {
  return [
    ...(a.extra ?? []),
    ...(a.onEdit ? [{ label: 'Edit', icon: <Pencil />, onSelect: a.onEdit }] : []),
    ...(a.onUp ? [{ label: 'Move up', icon: <ArrowUp />, disabled: a.first, onSelect: a.onUp }] : []),
    ...(a.onDown ? [{ label: 'Move down', icon: <ArrowDown />, disabled: a.last, onSelect: a.onDown }] : []),
    a.archived
      ? { label: 'Restore', icon: <ArchiveRestore />, separatorBefore: true, onSelect: a.onArchive }
      : { label: 'Archive', icon: <Archive />, separatorBefore: true, onSelect: a.onArchive },
    { label: 'Delete…', icon: <Trash2 />, danger: true, onSelect: a.onDelete },
  ]
}
