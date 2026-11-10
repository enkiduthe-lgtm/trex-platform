import test from 'node:test';
import assert from 'node:assert/strict';
import { financeDateTime } from './finance-report';

test('timestamps use Istanbul time across a calendar day boundary', () => {
  const value = financeDateTime('2026-11-09T22:30:00Z');
  assert.match(value, /10\.11\.2026/);
  assert.match(value, /01:30:00/);
  assert.equal(value, financeDateTime('2026-11-10T01:30:00+03:00'));
});

test('missing or invalid dates do not appear as Invalid Date', () => {
  assert.equal(financeDateTime(''), 'Tarih belirtilmedi');
  assert.equal(financeDateTime('not-a-date'), 'Tarih belirtilmedi');
});
