import test from 'node:test';
import assert from 'node:assert/strict';
import { inDashboardPeriod } from './dashboard-period';

test('dashboard calendar uses Istanbul midnight independently of the browser timezone', () => {
  const now = new Date('2026-11-08T21:30:00Z');
  assert.equal(inDashboardPeriod('2026-11-08T21:01:00Z', 'today', now), true);
  assert.equal(inDashboardPeriod('2026-11-08T20:59:00Z', 'today', now), false);
  assert.equal(inDashboardPeriod('2026-11-08T20:59:00Z', 'yesterday', now), true);
});

test('month, year and rolling seven day filters exclude future calendar days', () => {
  const now = new Date('2026-01-01T10:00:00Z');
  assert.equal(inDashboardPeriod('2025-12-31T21:00:00Z', 'month', now), true);
  assert.equal(inDashboardPeriod('2025-12-31T20:59:00Z', 'year', now), false);
  assert.equal(inDashboardPeriod('2025-12-26T12:00:00Z', 'week', now), true);
  assert.equal(inDashboardPeriod('2025-12-25T12:00:00Z', 'week', now), false);
  assert.equal(inDashboardPeriod('2026-01-02T12:00:00Z', 'month', now), false);
  assert.equal(inDashboardPeriod('invalid', 'all', now), false);
});
