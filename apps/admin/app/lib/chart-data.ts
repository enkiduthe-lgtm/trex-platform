export type ChartDatum = { label: string; value: number; color?: string };
type MoneyRow = { created_at: string; amount: string; currency: string };

export function dailySeries(rows: MoneyRow[], currency: string, now = new Date(), count = 7): ChartDatum[] {
  const key = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(date);
  const [year, month, day] = key(now).split('-').map(Number);
  const buckets = Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day - count + index + 1, 12));
    return { key: key(date), label: new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }).format(date), cents: 0 };
  });
  for (const row of rows) {
    const date = new Date(row.created_at), amount = Number(row.amount);
    if (row.currency !== currency || !Number.isFinite(amount) || !Number.isFinite(date.getTime())) continue;
    const bucket = buckets.find(item => item.key === key(date));
    if (bucket) bucket.cents += Math.round(amount * 100);
  }
  return buckets.map(item => ({ label: item.label, value: item.cents / 100 }));
}

/** A display-only series: preserve signed amounts and never mix currencies. */
export function monthlySeries(rows: MoneyRow[], currency: string, now = new Date(), count = 6): ChartDatum[] {
  const monthKey = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' }).format(date);
  const current = monthKey(now);
  const [year, month] = current.split('-').map(Number);
  const buckets = Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - count + index, 15));
    return { key: monthKey(date), label: new Intl.DateTimeFormat('tr-TR', { month: 'short', year: '2-digit', timeZone: 'Europe/Istanbul' }).format(date), cents: 0 };
  });
  for (const row of rows) {
    const amount = Number(row.amount), date = new Date(row.created_at);
    if (row.currency !== currency || !Number.isFinite(amount) || !Number.isFinite(date.getTime())) continue;
    const bucket = buckets.find(item => item.key === monthKey(date));
    if (bucket) bucket.cents += Math.round(amount * 100);
  }
  return buckets.map(item => ({ label: item.label, value: item.cents / 100 }));
}
