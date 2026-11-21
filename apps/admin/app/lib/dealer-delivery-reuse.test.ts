import test from 'node:test';
import assert from 'node:assert/strict';
import {dealerDeliveryFromAddress} from './dealer-delivery-reuse';
test('repeat-customer draft copies only delivery fields and uses the current dealer notification email',()=>{
 const address={recipient_name:' Örnek Alıcı ',phone:' 05320000000 ',city:' Bursa ',district:' Nilüfer ',address_line:' Örnek adres ',postal_code:null};
 const delivery=dealerDeliveryFromAddress(address,' DEALER@EXAMPLE.COM ');
 assert.equal(delivery?.phone,'05320000000');assert.equal(delivery?.contactEmail,'dealer@example.com');assert.equal(delivery?.postalCode,'');
 assert.equal(delivery?.addressLine,'Örnek adres');assert.equal(address.recipient_name,' Örnek Alıcı ');
 assert(!('items' in delivery!));assert(!('paymentMethod' in delivery!));assert(!('unitAmount' in delivery!));
});
test('orders without a delivery address cannot create a misleading repeat-customer draft',()=>{
 assert.equal(dealerDeliveryFromAddress(null,'dealer@example.com'),null);
});
