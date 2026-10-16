const p2 = (n: number) => String(n).padStart(2, '0')

export function todayStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return todayStr(d)
}

/** その週の月曜(YYYY-MM-DD) */
export function weekMonday(d: Date = new Date()): string {
  const x = new Date(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return todayStr(x)
}
