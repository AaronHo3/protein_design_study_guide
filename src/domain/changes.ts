// A Change is one row-level mutation plus enough "before" state to invert it.
// Every user action becomes a list of Changes: applied locally, sent to the
// repository in order, and inverted for undo.
import type { Row, Snapshot, TableName } from './types'

export type Change =
  | { op: 'insert'; table: TableName; rows: Row<TableName>[] }
  | { op: 'update'; table: TableName; id: string; patch: Record<string, unknown>; before: Record<string, unknown> }
  | { op: 'delete'; table: TableName; rows: Row<TableName>[] }

export function insert<T extends TableName>(table: T, rows: Row<T>[]): Change {
  return { op: 'insert', table, rows: rows as Row<TableName>[] }
}

export function remove<T extends TableName>(table: T, rows: Row<T>[]): Change {
  return { op: 'delete', table, rows: rows as Row<TableName>[] }
}

/** Builds an update whose `before` captures exactly the fields being changed. */
export function update<T extends TableName>(table: T, row: Row<T>, patch: Partial<Row<T>>): Change | null {
  const before: Record<string, unknown> = {}
  const effective: Record<string, unknown> = {}
  const current = row as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (JSON.stringify(current[key]) !== JSON.stringify(value)) {
      before[key] = current[key]
      effective[key] = value
    }
  }
  if (Object.keys(effective).length === 0) return null
  return { op: 'update', table, id: row.id, patch: effective, before }
}

export function compact(changes: (Change | null | undefined)[]): Change[] {
  return changes.filter((c): c is Change => c != null)
}

export function applyChange(snapshot: Snapshot, change: Change): Snapshot {
  const rows = snapshot[change.table] as Row<TableName>[]
  switch (change.op) {
    case 'insert': {
      const ids = new Set(change.rows.map((r) => r.id))
      return { ...snapshot, [change.table]: [...rows.filter((r) => !ids.has(r.id)), ...change.rows] }
    }
    case 'update':
      return {
        ...snapshot,
        [change.table]: rows.map((r) => (r.id === change.id ? { ...r, ...change.patch } : r)),
      }
    case 'delete': {
      const ids = new Set(change.rows.map((r) => r.id))
      return { ...snapshot, [change.table]: rows.filter((r) => !ids.has(r.id)) }
    }
  }
}

export function applyChanges(snapshot: Snapshot, changes: Change[]): Snapshot {
  return changes.reduce(applyChange, snapshot)
}

export function invertChange(change: Change): Change {
  switch (change.op) {
    case 'insert':
      return { op: 'delete', table: change.table, rows: change.rows }
    case 'delete':
      return { op: 'insert', table: change.table, rows: change.rows }
    case 'update':
      return { op: 'update', table: change.table, id: change.id, patch: change.before, before: change.patch }
  }
}

/** Inverse of a change list: inverted individually, applied in reverse order. */
export function invertChanges(changes: Change[]): Change[] {
  return [...changes].reverse().map(invertChange)
}
