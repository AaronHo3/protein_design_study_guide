// Local mode keeps the only copy of your data in this browser, so the app
// gently reminds you to export a backup now and then.
const LAST_BACKUP = 'study-planner.last-backup'
const SNOOZE_UNTIL = 'study-planner.backup-snooze'
const REMIND_AFTER_DAYS = 14
const SNOOZE_DAYS = 7
const DAY = 86_400_000

function read(key: string): number | null {
  try {
    const v = localStorage.getItem(key)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

function write(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Storage unavailable: the reminder just shows again later.
  }
}

export function markBackedUp(now = Date.now()): void {
  write(LAST_BACKUP, now)
}

export function lastBackupAt(): number | null {
  return read(LAST_BACKUP)
}

export function snoozeBackupReminder(now = Date.now()): void {
  write(SNOOZE_UNTIL, now + SNOOZE_DAYS * DAY)
}

export function backupReminderDue(now = Date.now()): boolean {
  const snooze = read(SNOOZE_UNTIL)
  if (snooze && snooze > now) return false
  const last = read(LAST_BACKUP)
  return last == null || now - last > REMIND_AFTER_DAYS * DAY
}

/** Asks the browser not to evict this site's storage under pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
