import test from 'node:test';
import assert from 'node:assert/strict';
import {dealerDeliveryErrors,normalizeDealerDelivery,validDealerMoney,dealerCheckoutTotal} from './dealer-order-validation';
const delivery={recipientName:'  Deneme Alıcı  ',contactEmail:' TEST@EXAMPLE.COM ',phone:' 05320000000 ',city:' Bursa ',district:' Nilüfer ',addressLine:' Deneme Mah. No: 1 ',postalCode:' 16000 '};
test('delivery normalization preserves phone leading zero, currency and payment method for stable retries',()=>{
 const normalized=normalizeDealerDelivery({...delivery,currency:'USD',paymentMethod:'TRANSFER'});
 assert.equal(normalized.recipientName,'Deneme Alıcı');assert.equal(normalized.contactEmail,'test@example.com');
 assert.equal(normalized.phone,'05320000000');assert.equal(normalized.currency,'USD');assert.equal(normalized.paymentMethod,'TRANSFER');
 assert.deepEqual(normalizeDealerDelivery(normalized),normalized);
 assert.equal(delivery.phone,' 05320000000 ');
});
test('whitespace required fields and excessive delivery text are reported before submitting',()=>{
 const errors=dealerDeliveryErrors({...delivery,recipientName:'  ',addressLine:'A'.repeat(501),city:'B'.repeat(101),postalCode:''});
 assert.ok(errors.recipientName);assert.ok(errors.addressLine);assert.ok(errors.city);assert.equal(errors.postalCode,undefined);
 assert.deepEqual(dealerDeliveryErrors({...delivery,addressLine:'A'.repeat(500),city:'B'.repeat(100)}),{});
});
test('money keeps exact cents and rejects silent rounding, negatives, non-finite and excessive values',()=>{
 for(const amount of ['0','0.00','75','75.50','9999999999.99','0001.50'])assert(validDealerMoney(amount),amount);
 for(const amount of ['', '-1','1.005','75,50','NaN','Infinity','1e2','10000000000','0.001'])assert.equal(validDealerMoney(amount),false,amount);
});
test('checkout adds cents exactly and rejects totals beyond the order storage limit',()=>{
 assert.equal(dealerCheckoutTotal('0.10','COD_CARD','0.20')?.total,'0.30');
 assert.equal(dealerCheckoutTotal('9999999999.98','COD_CASH','0.01')?.withinLimit,true);
 assert.equal(dealerCheckoutTotal('9999999999.99','COD_CASH','0.01')?.withinLimit,false);
 assert.equal(dealerCheckoutTotal('10000000000.00','TRANSFER','0')?.withinLimit,false);
 assert.equal(dealerCheckoutTotal('0.00','COD_CARD','75')?.positiveProducts,false);
 assert.equal(dealerCheckoutTotal('1.00','COD_CASH','0.005'),null);
 assert.equal(dealerCheckoutTotal('1.00','TRANSFER','invalid')?.total,'1.00');
});
