import test from 'node:test';
import assert from 'node:assert/strict';
import { orderPermissions } from './order-permissions';

test('view-only managers do not receive mutation or finance actions', () => {
  const result = orderPermissions('ADMIN', { configured: true, grants: ['ORDERS.VIEW'] });
  assert.equal(Object.values(result).some(Boolean), false);
});
test('order creation and editing permissions remain independent', () => {
  const create = orderPermissions('ADMIN', { configured: true, grants: ['ORDERS.VIEW', 'ORDERS.CREATE'] });
  assert.equal(create.create, true);
  assert.equal(create.edit, false);
  const edit = orderPermissions('ADMIN', { configured: true, grants: ['ORDERS.VIEW', 'ORDERS.EDIT'] });
  assert.equal(edit.create, false);
  assert.equal(edit.edit, true);
});
test('preparation permission does not authorize shipping or finance', () => {
  const result = orderPermissions('ADMIN', { configured: true, grants: ['STOCK.VIEW', 'STOCK.EDIT'] });
  assert.equal(result.prepare, true);
  assert.equal(result.ship, false);
  assert.equal(result.transfers, false);
});
test('mutation grants also require view permission', () => {
  const result = orderPermissions('ADMIN', { configured: true, grants: ['ORDERS.CREATE', 'SHIPPING.CREATE', 'STOCK.EDIT'] });
  assert.equal(Object.values(result).some(Boolean), false);
});
test('director, warehouse and legacy manager behavior follow their roles', () => {
  assert.equal(Object.values(orderPermissions('SUPER_ADMIN')).every(Boolean), true);
  assert.equal(orderPermissions('WAREHOUSE').prepare, true);
  assert.equal(orderPermissions('WAREHOUSE').ship, true);
  assert.equal(orderPermissions('WAREHOUSE').create, false);
  assert.equal(orderPermissions('ADMIN', { configured: false, grants: null }).edit, true);
  assert.equal(Object.values(orderPermissions('DEALER')).some(Boolean), false);
});
