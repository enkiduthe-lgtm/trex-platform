import { currencyTotals } from './report-totals';

export const salesGroups = { day: 'Günlük Satış Özeti', week: 'Haftalık Satışlar', month: 'Aylık Satışlar', product: 'Ürün Satış Raporu', channel: 'Platform Satış Performansı', payment: 'Ödeme Yöntemi Satış Raporu' };
export type SalesGroup = keyof typeof salesGroups;
type Sale = { id: string; created_at: string; product_name: string; sku: string; sales_channel: string; payment_method: string; status: string; currency: string; quantity: number; line_total: string };
export function groupSales(rows: Sale[], mode: SalesGroup) {
  const groups = new Map<string, { label: string; status: string; currency: string; orders: Set<string>; quantity: number; amounts: { currency: string; amount: string }[] }>();
  for (const row of rows) {
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date(row.created_at));
    const monday = new Date(`${day}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const label = mode === 'day' ? day : mode === 'week' ? monday.toISOString().slice(0, 10) : mode === 'month' ? day.slice(0, 7) : mode === 'product' ? `${row.product_name} · ${row.sku}` : mode === 'channel' ? row.sales_channel : row.payment_method || 'Belirtilmemiş';
    const key = JSON.stringify([label, row.status, row.currency]);
    const group = groups.get(key) ?? { label, status: row.status, currency: row.currency, orders: new Set<string>(), quantity: 0, amounts: [] };
    group.orders.add(row.id); group.quantity += Number(row.quantity); group.amounts.push({ currency: row.currency, amount: row.line_total }); groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, label: group.label, status: group.status, currency: group.currency, orderCount: group.orders.size, quantity: group.quantity, amount: currencyTotals(group.amounts)[0].amount })).sort((a, b) => a.label.localeCompare(b.label, 'tr') || a.currency.localeCompare(b.currency) || a.status.localeCompare(b.status));
}
