import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesDealerOrder,dealerOrderProductsLabel,dealerOrderProductLines} from './dealer-order-history';

const order={order_number:'20261120-000001',recipient_name:'İPEK YILMAZ',tracking_number:'123456789',
 items:[{id:'tea',product_name:'Trex Tea',sku:'TEA-01',quantity:5},{id:'gel',product_name:'Bakım Jeli',sku:'JEL-02',quantity:3}]};

test('dealer history searches customer, product, SKU, order and shipment using Turkish casing',()=>{
 for(const query of [' ipek ','yılmaz','tea','bakım','JEL-02','20261120','456789',''])assert.equal(matchesDealerOrder(order,query),true,query);
 assert.equal(matchesDealerOrder(order,'başka müşteri'),false);
});

test('order export preserves actual unit quantities without splitting package orders',()=>{
 assert.equal(dealerOrderProductsLabel(order),'Trex Tea × 5 adet; Bakım Jeli × 3 adet');
});

test('old API responses without products or customer remain searchable and exportable',()=>{
 const old={order_number:'OLD-1'};
 assert.equal(matchesDealerOrder(old,'old'),true);
 assert.equal(matchesDealerOrder(old,'ipek'),false);
 assert.equal(dealerOrderProductsLabel(old),'');
});
test('rounding allocations of one package appear as one product total while distinct SKUs remain separate',()=>{
 const split={order_number:'PACK-1',items:[
  {id:'a',product_name:'Trex Tea',sku:'TEA',quantity:2},
  {id:'b',product_name:'Trex Tea',sku:'TEA',quantity:3},
  {id:'c',product_name:'Trex Tea',sku:'OTHER',quantity:1},
 ]};
 const groups=dealerOrderProductLines(split);
 assert.equal(groups.length,2);assert.equal(groups[0].quantity,5);
 assert.equal(dealerOrderProductsLabel(split),'Trex Tea × 5 adet; Trex Tea × 1 adet');
 assert.equal(split.items.length,3,'Historical price allocation rows remain intact');
});
