import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesOrderSearch} from './order-search';
const order={order_number:'20261109-000001',customer_name:'İSMAİL',sales_channel:'RETAIL',products:[{product_name:'Trex Tea',sku:'TEA-01'}]};
test('searches Turkish channel names, saved products, SKU and Turkish customer names',()=>{
  for(const query of [' perakende ','trex tea','tea-01','ismail','20261109']) assert.equal(matchesOrderSearch(order,query,'Perakende'),true);
  assert.equal(matchesOrderSearch(order,'olmayan','Perakende'),false);
});
test('old responses without products and empty search remain supported',()=>{
  assert.equal(matchesOrderSearch({order_number:'1'},'  '),true);
  assert.equal(matchesOrderSearch({order_number:'1'},'tea'),false);
});
