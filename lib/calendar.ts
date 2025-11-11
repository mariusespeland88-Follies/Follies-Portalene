// lib/calendar.ts
export type CalendarItem = {
  id: string
  title: string
  description?: string
  start: string
  start_local?: string
  type?: string
  relatedId?: string
}

function normalizeDateTime(date: string | Date): { start: string; start_local: string } {
  const d = typeof date === 'string' ? new Date(date) : date
  return {
    start: d.toISOString(),
    start_local: d.toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' }).replace(' ', 'T')
  }
}

export function addToCalendar(item: Omit<CalendarItem, 'start' | 'start_local'> & { date: string | Date }) {
  const { start, start_local } = normalizeDateTime(item.date)
  const newItem: CalendarItem = {
    ...item,
    start,
    start_local
  }

  const keys = ['follies.calendar.v1', 'follies.calendar']
  keys.forEach(key => {
    const existing: CalendarItem[] = JSON.parse(localStorage.getItem(key) || '[]')

    const duplicate = existing.some(e =>
      e.title === newItem.title &&
      e.start === newItem.start &&
      (e.relatedId || e.id) === (newItem.relatedId || newItem.id)
    )

    if (!duplicate) {
      existing.push(newItem)
      localStorage.setItem(key, JSON.stringify(existing))
    }
  })
}
