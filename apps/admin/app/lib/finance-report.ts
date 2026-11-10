// Calendar filters use the business timezone, independent of the viewer's device.
export function financeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function financeDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Tarih belirtilmedi' : date.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
}
export function inFinancePeriod(value: string, from: string, to: string) {
  const date = financeDate(value);
  return !!date && (!from || date >= from) && (!to || date <= to) && !(from && to && from > to);
}
export function financeTotals(items: { amount: string; currency: string }[]) {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.currency, (totals.get(item.currency) ?? 0) + Math.round(Number(item.amount) * 100));
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, cents]) => ({ currency, amount: cents / 100 }));
}
