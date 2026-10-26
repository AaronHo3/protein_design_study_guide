import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, diffDays, isISODate, monthGrid, startOfWeek, studyDaysFrom, todayIn, weekday,
} from '../../src/lib/dates'

describe('calendar dates', () => {
  it('does arithmetic across month, year and DST boundaries without drifting', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08') // US DST starts 2026-03-08
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(diffDays('2027-01-01', '2026-12-25')).toBe(7)
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('uses ISO weekdays starting Monday', () => {
    expect(weekday('2026-10-26')).toBe(1) // Monday
    expect(weekday('2026-11-01')).toBe(7) // Sunday
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26')
    expect(monthGrid('2026-11-15')[0]).toBe('2026-10-26')
    expect(monthGrid('2026-11-15')).toHaveLength(42)
  })

  it('validates real calendar dates only', () => {
    expect(isISODate('2026-02-29')).toBe(false)
    expect(isISODate('2028-02-29')).toBe(true)
    expect(isISODate('2026-1-01')).toBe(false)
    expect(isISODate('2026-10-26T00:00:00Z')).toBe(false)
  })

  it('resolves "today" in the configured timezone, not the device zone', () => {
    const instant = new Date('2026-10-27T02:30:00Z')
    expect(todayIn('UTC', instant)).toBe('2026-10-27')
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-10-26')
    expect(todayIn('Asia/Tokyo', instant)).toBe('2026-10-27')
    expect(todayIn('Not/AZone', instant)).toBe('2026-10-27')
  })

  it('finds the next study days from a start date', () => {
    expect(studyDaysFrom('2026-10-31', [1, 2, 3, 4, 5], 3)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
    expect(studyDaysFrom('2026-10-31', [], 3)).toEqual([])
  })
})
