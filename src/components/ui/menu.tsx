import * as DM from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
}

interface MenuProps {
  items: MenuItem[]
  label: string
  trigger?: ReactNode
  align?: 'start' | 'end'
}

export function Menu({ items, label, trigger, align = 'end' }: MenuProps) {
  return (
    <DM.Root>
      <DM.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label={label}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          sideOffset={4}
          className="z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-panel animate-fade-in"
        >
          {items.map((item) => (
            <div key={item.label}>
              {item.separatorBefore && <DM.Separator className="my-1 h-px bg-line" />}
              <DM.Item
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none',
                  'data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted',
                  item.danger && 'text-danger [&_svg]:text-danger',
                )}
              >
                {item.icon}
                {item.label}
              </DM.Item>
            </div>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}
