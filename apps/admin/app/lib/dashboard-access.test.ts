import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardAccess } from './dashboard-access';

test('dashboard sections follow the manager view grants independently', () => {
  assert.deepEqual(dashboardAccess('ADMIN',{configured:true,grants:['ORDERS.VIEW']}),{
    orders:true,stock:false,support:false,shipping:false,reports:false,
  });
  assert.deepEqual(dashboardAccess('ADMIN',{configured:true,grants:[]}),{
    orders:false,stock:false,support:false,shipping:false,reports:false,
  });
});

test('dashboard keeps legacy roles scoped to their server permissions', () => {
  assert.equal(Object.values(dashboardAccess('SUPER_ADMIN')).every(Boolean),true);
  assert.equal(dashboardAccess('FINANCE').stock,false);
  assert.equal(dashboardAccess('WAREHOUSE').support,false);
  assert.equal(dashboardAccess('ADMIN').reports,false);
  assert.equal(Object.values(dashboardAccess('DEALER')).some(Boolean),false);
});
