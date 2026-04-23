/** 计算离某个 YYYY-MM-DD 日期结束还有多少天（向上取整，已过期返回负数）*/
export function daysUntil(date: string): number {
  const ts = new Date(date + 'T23:59:59').getTime()
  return Math.ceil((ts - Date.now()) / 86_400_000)
}

/** 返回今天 YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 返回 N 天后的 YYYY-MM-DD */
export function addDaysISO(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}
