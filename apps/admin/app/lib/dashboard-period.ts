import { financeDate, inFinancePeriod } from './finance-report';

export type DashboardPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all';

export function inDashboardPeriod(value: string, period: DashboardPeriod, now = new Date()) {
  if (period === 'all') return !!financeDate(value);
  const today = financeDate(now.toISOString());
  const start = new Date(today + 'T12:00:00Z');
  if (period === 'yesterday') {
    start.setUTCDate(start.getUTCDate() - 1);
    const yesterday = start.toISOString().slice(0, 10);
    return inFinancePeriod(value, yesterday, yesterday);
  }
  if (period === 'week') start.setUTCDate(start.getUTCDate() - 6);
  if (period === 'month') start.setUTCDate(1);
  if (period === 'year') start.setUTCMonth(0, 1);
  return inFinancePeriod(value, start.toISOString().slice(0, 10), today);
}
