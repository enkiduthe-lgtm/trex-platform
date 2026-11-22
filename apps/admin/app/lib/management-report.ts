export type ManagementFilters = { dateFrom: string; dateTo: string; currency: string };
export type ManagementRow = { status?: string; sales_channel?: string; label?: string; sku?: string; count: number; amount: string };
export type ManagementReport = ManagementFilters & {
  generatedAt: string;
  totals: { order_count: number; revenue: string; average_order: string };
  financial: { income: string; expense: string; net: string };
  statuses: ManagementRow[]; channels: ManagementRow[]; daily: ManagementRow[]; topProducts: ManagementRow[];
};
export type ManagementOperations = { returns_open: number; returns_refunded: number; shipments_active: number; shipments_failed: number; shipments_returned: number; support_overdue: number };

function invalid(): never { throw new Error('Rapor verileri doğrulanamadı. Yeniden deneyin.'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
function cents(value: unknown): bigint {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) return invalid();
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const result = (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'))) * (value.startsWith('-') ? BigInt(-1) : BigInt(1));
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < -BigInt(Number.MAX_SAFE_INTEGER)) return invalid();
  return result;
}
function date(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid();
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return invalid();
  return timestamp;
}
export function validManagementFilters(filters: ManagementFilters): boolean {
  try {
    const days = (date(filters.dateTo) - date(filters.dateFrom)) / 86400000;
    return days >= 0 && days <= 3660 && ['TRY', 'USD', 'EUR'].includes(filters.currency);
  } catch { return false; }
}
export function validateManagementReport(value: unknown, filters: ManagementFilters): ManagementReport {
  if (!validManagementFilters(filters)) return invalid();
  const report = object(value);
  if (report.dateFrom !== filters.dateFrom || report.dateTo !== filters.dateTo || report.currency !== filters.currency) return invalid();
  if (typeof report.generatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(report.generatedAt) || !Number.isFinite(Date.parse(report.generatedAt))) return invalid();
  const totals = object(report.totals), financial = object(report.financial);
  const totalCount = count(totals.order_count), revenue = cents(totals.revenue), average = cents(totals.average_order);
  if (cents(financial.income) - cents(financial.expense) !== cents(financial.net)) return invalid();
  const groups: Record<string, Record<string, unknown>[]> = {};
  for (const [name, keys] of [['statuses', ['status']], ['channels', ['sales_channel']], ['daily', ['label']], ['topProducts', ['label', 'sku']]] as const) {
    const values = report[name];
    if (!Array.isArray(values)) return invalid();
    const seen = new Set<string>();
    groups[name] = values.map(value => {
      const row = object(value);
      if (keys.some(key => typeof row[key] !== 'string')) return invalid();
      const key = JSON.stringify(keys.map(key => row[key]));
      if (seen.has(key)) return invalid();
      seen.add(key); count(row.count); cents(row.amount);
      return row;
    });
    if (name !== 'topProducts' && groups[name].reduce((sum, row) => sum + BigInt(row.count as number), BigInt(0)) !== BigInt(totalCount)) return invalid();
    if (name === 'channels' || name === 'daily') {
      if (groups[name].reduce((sum, row) => sum + cents(row.amount), BigInt(0)) !== revenue) return invalid();
    }
  }
  const start = date(filters.dateFrom), end = date(filters.dateTo);
  if (groups.daily.length !== (end - start) / 86400000 + 1) return invalid();
  groups.daily.forEach((row, index) => { if (date(row.label) !== start + index * 86400000) return invalid(); });
  const salesCount = groups.statuses.filter(row => row.status !== 'CANCELLED' && row.status !== 'REFUNDED').reduce((sum, row) => sum + BigInt(row.count as number), BigInt(0));
  if (salesCount === BigInt(0)) { if (revenue !== BigInt(0) || average !== BigInt(0)) return invalid(); }
  else {
    const quotient = revenue / salesCount, remainder = revenue % salesCount;
    const rounded = quotient + ((remainder < BigInt(0) ? -remainder : remainder) * BigInt(2) >= salesCount ? (revenue < BigInt(0) ? BigInt(-1) : BigInt(1)) : BigInt(0));
    if (average !== rounded) return invalid();
  }
  return report as unknown as ManagementReport;
}
export function validateManagementOperations(value: unknown): ManagementOperations {
  const operations = object(value);
  for (const key of ['returns_open', 'returns_refunded', 'shipments_active', 'shipments_failed', 'shipments_returned', 'support_overdue']) count(operations[key]);
  return operations as unknown as ManagementOperations;
}
