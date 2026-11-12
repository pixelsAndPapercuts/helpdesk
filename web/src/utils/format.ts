export function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const time = (d: Date) =>
  d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return `Today, ${time(date)}`
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time(date)}`
  return `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })}, ${time(date)}`
}

export function formatDuration(startIso: string, endIso: string): string {
  const totalSec = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000))
  if (totalSec < 60) return `${totalSec} sec`
  const min = Math.round(totalSec / 60)
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`
}
