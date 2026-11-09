import test from 'node:test';
import assert from 'node:assert/strict';
import { customerOrderReportRows, type CustomerOrderReportLine } from './customer-order-report';
const line = (overrides:Partial<CustomerOrderReportLine>):CustomerOrderReportLine => ({order_number:'ORDER-1',created_at:'2026-11-08T21:30:00Z',status:'DELIVERED',currency:'TRY',sales_channel:'DEALER_PORTAL',product_name:'Trex Tea',sku:'TEA',quantity:2,unit_amount:'10.25',line_total:'20.50',payment_method:'dealer_commission',...overrides});
test('customer export preserves product rows and translates recorded codes', () => {
  const rows=customerOrderReportRows([line({}),line({sku:'CAP',product_name:'Trex Cap',quantity:1,unit_amount:'5.50',line_total:'5.50'})],'','');
  const products=rows.filter(row=>row[1]==='ORDER-1');
  assert.equal(products.length,2);
  assert.equal(products[0][8],'Prim Bakiyesi');
  assert.equal(products[0][9],'Teslim Edildi');
  assert.equal(products[0][10],'Sistem Bayi');
  assert.deepEqual(rows.find(row=>row[0]==='İptal Ve İadeler Hariç'),['İptal Ve İadeler Hariç','TRY',26]);
});
test('customer export separates cancellations, returns and currency totals', () => {
  const rows=customerOrderReportRows([line({}),line({status:'CANCELLED'}),line({status:'REFUNDED'}),line({currency:'EUR'})],'','');
  assert.deepEqual(rows.filter(row=>row[0]==='İptal Ve İadeler Hariç'),[['İptal Ve İadeler Hariç','EUR',20.5],['İptal Ve İadeler Hariç','TRY',20.5]]);
  assert.deepEqual(rows.find(row=>row[0]==='İptal Edilen Siparişlerin Ürün Tutarı'),['İptal Edilen Siparişlerin Ürün Tutarı','TRY',20.5]);
  assert.deepEqual(rows.find(row=>row[0]==='İade Durumundaki Siparişlerin Ürün Tutarı'),['İade Durumundaki Siparişlerin Ürün Tutarı','TRY',20.5]);
});
