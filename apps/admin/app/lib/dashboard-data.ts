import type { DashboardPeriod } from './dashboard-period';

export type DashboardOperations = { waiting: string; picking: string; packing: string; critical_stock: string; returns_pending: string };
export type DashboardStock = { id: string; name: string; warehouse_name: string; available_quantity: number };
export type DashboardSupport = { open_count: string; urgent_count: string; overdue_count: string };
export type DashboardOrder = { period: DashboardPeriod; id: string; order_number: string; status: string; total_amount: string; currency: string; customer_email: string | null; customer_name: string | null; item_count: string; created_at: string };
export type DashboardSummary = {
  generatedAt: string;
  periods: { period: DashboardPeriod; currency: string; total_count: number; sales_count: number; amount: string }[];
  trend: { created_at: string; currency: string; amount: string }[];
  stages: { stage: string; count: number }[];
  carriers: { provider: string; count: number }[];
  recent: DashboardOrder[];
};
const periods = ['today', 'yesterday', 'week', 'month', 'year', 'all'];
const stages = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'REGISTERED', 'SHIPPED', 'DELIVERED', 'CARRIER_RETURN', 'REFUNDED', 'CANCELLED'];
function invalid(): never { throw new Error('Ana sayfa verileri doğrulanamadı. Yenileyerek tekrar deneyin.'); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function string(value: unknown): string { if (typeof value !== 'string') return invalid(); return value; }
function count(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid(); return value; }
function countText(value: unknown): number { if (typeof value !== 'string' || !/^\d+$/.test(value)) return invalid(); return count(Number(value)); }
function amount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return invalid();
  const [whole, fraction = ''] = value.split('.'), cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return invalid();
  return cents;
}
function timestamp(value: unknown): number { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return invalid(); return Date.parse(value); }
function currency(value: unknown): string { const code = string(value); if (!/^[A-Z]{3}$/.test(code)) return invalid(); return code; }
const calendarDay = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export function validateDashboardOperations(value: unknown): DashboardOperations {
  const data = object(value);
  for (const key of ['waiting', 'picking', 'packing', 'critical_stock', 'returns_pending']) countText(data[key]);
  return data as unknown as DashboardOperations;
}
export function validateDashboardStock(value: unknown): DashboardStock[] {
  if (!Array.isArray(value)) return invalid();
  value.forEach(value => { const row = object(value); string(row.id); string(row.name); string(row.warehouse_name); if (typeof row.available_quantity !== 'number' || !Number.isSafeInteger(row.available_quantity)) return invalid(); });
  return value as DashboardStock[];
}
export function validateDashboardSupport(value: unknown): DashboardSupport {
  const data = object(value), open = countText(data.open_count);
  if (countText(data.urgent_count) > open || countText(data.overdue_count) > open) return invalid();
  return data as unknown as DashboardSupport;
}
export function validateDashboardSummary(value: unknown): DashboardSummary {
  const data = object(value); timestamp(data.generatedAt);
  for (const key of ['periods', 'trend', 'stages', 'carriers', 'recent']) if (!Array.isArray(data[key])) return invalid();
  const summary = data as unknown as DashboardSummary, periodKeys = new Set<string>(), trendKeys = new Set<string>(), stageKeys = new Set<string>(), carrierKeys = new Set<string>(), recentKeys = new Set<string>();
  for (const row of summary.periods) {
    object(row); if (!periods.includes(row.period)) return invalid(); currency(row.currency);
    const key = JSON.stringify([row.period, row.currency]); if (periodKeys.has(key)) return invalid(); periodKeys.add(key);
    const total = count(row.total_count), sales = count(row.sales_count), money = amount(row.amount);
    if (sales > total || (sales === 0 && money !== BigInt(0))) return invalid();
  }
  const today = calendarDay(summary.generatedAt), firstDay = new Date(Date.parse(today + 'T00:00:00Z') - 6 * 86400000).toISOString().slice(0, 10);
  for (const row of summary.trend) {
    object(row); timestamp(row.created_at); currency(row.currency); amount(row.amount);
    const day = calendarDay(row.created_at), key = JSON.stringify([day, row.currency]);
    if (day < firstDay || day > today || trendKeys.has(key)) return invalid(); trendKeys.add(key);
  }
  for (const code of new Set([...summary.trend.map(row => row.currency), ...summary.periods.filter(row => row.period === 'week').map(row => row.currency)])) {
    const trendTotal = summary.trend.filter(row => row.currency === code).reduce((sum, row) => sum + amount(row.amount), BigInt(0));
    if (trendTotal !== amount(summary.periods.find(row => row.period === 'week' && row.currency === code)?.amount ?? '0')) return invalid();
  }
  for (const row of summary.stages) { object(row); if (!stages.includes(row.stage) || stageKeys.has(row.stage)) return invalid(); stageKeys.add(row.stage); count(row.count); }
  const allCount = summary.periods.filter(row => row.period === 'all').reduce((sum, row) => sum + BigInt(row.total_count), BigInt(0));
  if (summary.stages.reduce((sum, row) => sum + BigInt(row.count), BigInt(0)) !== allCount) return invalid();
  for (const row of summary.carriers) { object(row); string(row.provider); if (carrierKeys.has(row.provider)) return invalid(); carrierKeys.add(row.provider); count(row.count); }
  const recentCounts = new Map<string, number>();
  for (const row of summary.recent) {
    object(row); if (!periods.includes(row.period) || !stages.includes(row.status) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(string(row.id))) return invalid();
    string(row.order_number); currency(row.currency); timestamp(row.created_at); countText(row.item_count); amount(row.total_amount);
    for (const key of ['customer_email', 'customer_name'] as const) if (row[key] !== null) string(row[key]);
    const key = JSON.stringify([row.period, row.id]); if (recentKeys.has(key)) return invalid(); recentKeys.add(key);
    recentCounts.set(row.period, (recentCounts.get(row.period) ?? 0) + 1);
  }
  for (const [period, size] of recentCounts) if (size > 5 || BigInt(size) > summary.periods.filter(row => row.period === period).reduce((sum, row) => sum + BigInt(row.total_count), BigInt(0))) return invalid();
  return summary;
}
