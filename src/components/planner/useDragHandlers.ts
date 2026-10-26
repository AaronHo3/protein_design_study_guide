import { KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useCallback } from 'react'
import { blocksOn } from '../../domain/completion'
import { moveBlock, scheduleSession, unscheduleSession } from '../../domain/scheduling'
import { formatShortDate } from '../../lib/dates'
import { act } from '../../state/actions'
import { useStore } from '../../state/store'
import { toast } from '../../state/toasts'

export const BACKLOG_DROP = 'backlog'
export const dayDropId = (date: string) => `day:${date}`

type Target = { kind: 'day'; date: string; index: number } | { kind: 'backlog' }

function resolveTarget(overId: string): Target | null {
  const data = useStore.getState().data
  if (overId === BACKLOG_DROP || overId.startsWith('session:')) return { kind: 'backlog' }
  if (overId.startsWith('day:')) {
    const date = overId.slice(4)
    return { kind: 'day', date, index: blocksOn(data, date).length }
  }
  if (overId.startsWith('block:')) {
    const block = data.blocks.find((b) => b.id === overId.slice(6))
    if (!block) return null
    const index = blocksOn(data, block.date).findIndex((b) => b.id === block.id)
    return { kind: 'day', date: block.date, index }
  }
  return null
}

/** Drag-and-drop semantics for the week view and backlog. Every drop is a normal, undoable change. */
export function useDragHandlers() {
  const ctx = useStore((s) => s.ctx)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      if (!e.over) return
      const activeId = String(e.active.id)
      const target = resolveTarget(String(e.over.id))
      if (!target) return
      const data = useStore.getState().data

      if (activeId.startsWith('block:')) {
        const block = data.blocks.find((b) => b.id === activeId.slice(6))
        if (!block) return
        if (target.kind === 'backlog') {
          if (!block.session_id) return toast('Empty blocks can’t go to the backlog — remove the block instead.')
          void act(unscheduleSession(data, block.session_id), { label: 'Returned to backlog' })
          return
        }
        if (target.date === block.date) {
          const current = blocksOn(data, block.date).findIndex((b) => b.id === block.id)
          if (current === target.index) return
          void act(moveBlock(data, block.id, target.date, target.index, ctx))
        } else {
          void act(moveBlock(data, block.id, target.date, target.index, ctx), { label: `Moved to ${formatShortDate(target.date)}` })
        }
        return
      }

      if (activeId.startsWith('session:') && target.kind === 'day') {
        void act(scheduleSession(data, activeId.slice(8), target.date, ctx, { index: target.index }), {
          label: `Scheduled for ${formatShortDate(target.date)}`,
        })
      }
    },
    [ctx],
  )

  return { sensors, onDragEnd }
}
