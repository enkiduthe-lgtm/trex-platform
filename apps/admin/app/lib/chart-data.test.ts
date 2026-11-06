import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySeries, monthlySeries } from './chart-data';

test('monthly series isolates currency, preserves reversals and sums cents exactly', () => {
  const rows = [
    {created_at:'2026-11-01T10:00:00Z',amount:'0.10',currency:'TRY'},
    {created_at:'2026-11-02T10:00:00Z',amount:'0.20',currency:'TRY'},
    {created_at:'2026-10-31T20:00:00Z',amount:'-10.50',currency:'TRY'},
    {created_at:'2026-11-01T10:00:00Z',amount:'999.00',currency:'USD'},
    {created_at:'2025-11-01T10:00:00Z',amount:'900.00',currency:'TRY'},
  ];
  assert.deepEqual(monthlySeries(rows,'TRY',new Date('2026-11-06T09:00:00Z')).map(p=>p.value),[0,0,0,0,-10.5,.3]);
});
test('daily buckets use Istanbul midnight and ignore invalid input', () => {
  const rows = [
    {created_at:'2026-11-05T20:59:59Z',amount:'12.50',currency:'TRY'},
    {created_at:'2026-11-05T21:00:00Z',amount:'20.00',currency:'TRY'},
    {created_at:'2026-11-06T09:00:00Z',amount:'9.00',currency:'EUR'},
    {created_at:'invalid',amount:'8.00',currency:'TRY'},
    {created_at:'2026-11-06T09:00:00Z',amount:'invalid',currency:'TRY'},
  ];
  assert.deepEqual(dailySeries(rows,'TRY',new Date('2026-11-06T10:00:00Z'),2).map(p=>p.value),[12.5,20]);
});
test('month series crosses year boundaries without inventing data', () => {
  assert.deepEqual(monthlySeries([{created_at:'2025-12-31T21:01:00Z',amount:'1.00',currency:'TRY'}],'TRY',new Date('2026-01-02T10:00:00Z'),2).map(p=>p.value),[0,1]);
  assert.deepEqual(dailySeries([],'TRY',new Date('2026-01-01T10:00:00Z'),3).map(p=>p.value),[0,0,0]);
});
