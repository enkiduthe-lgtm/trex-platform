import test from 'node:test';
import assert from 'node:assert/strict';
import {customerDeliveryFields} from './customer-selection';
const current={customerId:'a',city:'Bursa',district:'Nilüfer',addressLine:'Kayıtlı Teslimat Adresi',postalCode:'16000'};
test('switching or clearing customer removes previous delivery address',()=>{
 for(const id of ['b','']) assert.deepEqual(customerDeliveryFields(current,id),{city:'',district:'',addressLine:'',postalCode:''});
});
test('reselecting the same customer preserves entered delivery address',()=>{
 const {customerId,...address}=current;assert.deepEqual(customerDeliveryFields(current,customerId),address);
});
