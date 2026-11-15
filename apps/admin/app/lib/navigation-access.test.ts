import test from 'node:test';
import assert from 'node:assert/strict';
import { managerNavEntryAllowed } from './navigation-access';

test('navigation checks the destination permission for links in another section', () => {
  assert.equal(managerNavEntryAllowed('/kargo', 'STOCK', ['STOCK.VIEW']), false);
  assert.equal(managerNavEntryAllowed('/kargo', 'STOCK', ['SHIPPING.VIEW']), true);
  assert.equal(managerNavEntryAllowed('/destek', 'CUSTOMERS', ['CUSTOMERS.VIEW']), false);
  assert.equal(managerNavEntryAllowed('/destek', 'CUSTOMERS', ['SUPPORT.VIEW']), true);
  assert.equal(managerNavEntryAllowed('/siparisler/havaleler', 'ORDERS', ['FINANCE.VIEW']), true);
  assert.equal(managerNavEntryAllowed('/bayiler/satis-raporu', 'DEALERS', ['REPORTS.VIEW']), false);
  assert.equal(managerNavEntryAllowed('/bayiler/satis-raporu', 'DEALERS', ['REPORTS.VIEW','DEALERS.VIEW']), true);
});

test('navigation filters director pages and requires creation access for fast sales', () => {
  assert.equal(managerNavEntryAllowed('/siparisler?durum=PAID', 'ORDERS', ['ORDERS.VIEW']), true);
  assert.equal(managerNavEntryAllowed('/siparisler/yeni', 'ORDERS', ['ORDERS.VIEW']), false);
  assert.equal(managerNavEntryAllowed('/siparisler/yeni', 'ORDERS', ['ORDERS.VIEW','ORDERS.CREATE']), true);
  assert.equal(managerNavEntryAllowed('/siparisler/sil', 'ORDERS', ['ORDERS.VIEW','ORDERS.DELETE']), false);
  assert.equal(managerNavEntryAllowed('/raporlar/ozel?dateFrom=2026-11-01', 'REPORTS', ['REPORTS.VIEW']), false);
});
