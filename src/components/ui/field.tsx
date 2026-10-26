import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const control =
  'w-full rounded-md border border-line bg-surface px-2.5 text-sm text-fg placeholder:text-faint ' +
  'transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus-visible:outline-2 ' +
  'focus-visible:outline-offset-0 disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-9', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(control, 'min-h-20 py-2 leading-relaxed', className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, 'h-9 pr-7', className)} {...props}>
      {children}
    </select>
  )
})

interface FieldProps {
  label: string
  hint?: ReactNode
  children: (id: string) => ReactNode
  className?: string
}

/** Label + control + hint, with ids wired for accessibility. */
export function Field({ label, hint, children, className }: FieldProps) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  )
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  const box = (
    <input
      type="checkbox"
      className={cn('size-4 shrink-0 cursor-pointer rounded accent-[var(--accent)]', className)}
      {...props}
    />
  )
  if (!label) return box
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      {box}
      <span>{label}</span>
    </label>
  )
}
