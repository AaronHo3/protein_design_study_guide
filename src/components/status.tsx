import { Circle, CircleCheck, CircleDashed, CircleDot, CircleMinus, Coffee, CircleSlash } from 'lucide-react'
import type { DayKind, WorkState } from '../domain/completion'
import { DAY_KIND_LABEL } from '../domain/completion'
import { cn } from '../lib/cn'

export const WORK_LABEL: Record<WorkState, string> = {
  complete: 'Complete',
  in_progress: 'In progress',
  planned: 'Planned',
  skipped: 'Skipped',
}

/** Shape + color + accessible label, so state never relies on color alone. */
export function WorkIcon({ state, className }: { state: WorkState; className?: string }) {
  const props = { className: cn('size-4 shrink-0', className), 'aria-label': WORK_LABEL[state], role: 'img' as const }
  switch (state) {
    case 'complete':
      return <CircleCheck {...props} className={cn(props.className, 'text-success')} />
    case 'in_progress':
      return <CircleDot {...props} className={cn(props.className, 'text-accent')} />
    case 'skipped':
      return <CircleSlash {...props} className={cn(props.className, 'text-faint')} />
    default:
      return <Circle {...props} className={cn(props.className, 'text-faint')} />
  }
}

export function DayIcon({ kind, className }: { kind: DayKind; className?: string }) {
  const props = { className: cn('size-3.5 shrink-0', className), 'aria-label': DAY_KIND_LABEL[kind], role: 'img' as const }
  switch (kind) {
    case 'complete':
      return <CircleCheck {...props} className={cn(props.className, 'text-success')} />
    case 'partial':
      return <CircleDot {...props} className={cn(props.className, 'text-accent')} />
    case 'planned':
      return <Circle {...props} className={cn(props.className, 'text-muted')} />
    case 'no_required':
      return <CircleDashed {...props} className={cn(props.className, 'text-muted')} />
    case 'rest':
      return <Coffee {...props} className={cn(props.className, 'text-faint')} />
    default:
      return <CircleMinus {...props} className={cn(props.className, 'text-faint')} />
  }
}
