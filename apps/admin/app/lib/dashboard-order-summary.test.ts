import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardOrderSummary} from './dashboard-order-summary';
test('registered orders remain visible in dashboard total',()=>{
 const rows=dashboardOrderSummary([{status:'PROCESSING',shipment_status:'CREATED'},{status:'PROCESSING',shipment_status:'CREATED'}]);
 assert.equal(rows.reduce((sum,row)=>sum+row.value,0),2);
 assert.equal(rows.find(row=>row.href.endsWith('REGISTERED'))?.value,2);
});
test('all supported stages count once and terminal orders retain their status',()=>{
 const orders=['PENDING_PAYMENT','PAID','PROCESSING','SHIPPED','DELIVERED','REFUNDED','CANCELLED'].map(status=>({status,shipment_status:null as string|null}));
 orders.push({status:'CANCELLED',shipment_status:'CREATED'});
 const rows=dashboardOrderSummary(orders);
 assert.equal(rows.reduce((sum,row)=>sum+row.value,0),8);
 assert.equal(rows.find(row=>row.href.endsWith('CANCELLED'))?.value,2);
 assert.equal(rows.find(row=>row.href.endsWith('PAID'))?.value,1);
});
test('counts carrier returns separately from shipments and completed refunds',()=>{
 const rows=dashboardOrderSummary([
  {status:'SHIPPED',tracking_direction_code:'3'},
  {status:'SHIPPED',tracking_direction_code:'3',sales_status:'REFUNDED'},
 ]);
 assert.equal(rows.find(row=>row.href.endsWith('CARRIER_RETURN'))?.value,1);
 assert.equal(rows.find(row=>row.href.endsWith('REFUNDED'))?.value,1);
 assert.equal(rows.find(row=>row.href.endsWith('SHIPPED'))?.value,0);
});
