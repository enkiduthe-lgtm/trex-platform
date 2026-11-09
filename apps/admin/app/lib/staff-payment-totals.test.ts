import test from 'node:test';
import assert from 'node:assert/strict';
import {staffPaymentTotals} from './staff-payment-totals';
const earn=(amount:string)=>({amount,status:'CONFIRMED',entry_kind:'EARN',staff_paid_amount:null});
test('many small commissions retain exact cents',()=>{
 assert.deepEqual(staffPaymentTotals(Array.from({length:1000},()=>earn('0.01'))),{net:'10.00',paid:'0.00',unpaid:'10.00'});
});
test('actual payments and reversals are counted once and negative balances stay visible',()=>{
 assert.deepEqual(staffPaymentTotals([{...earn('10.00'),status:'PAID',staff_paid_amount:'8.00'},{...earn('-5.00'),entry_kind:'REVERSAL',status:'REVERSED'}]),{net:'5.00',paid:'8.00',unpaid:'-3.00'});
 assert.deepEqual(staffPaymentTotals([]),{net:'0.00',paid:'0.00',unpaid:'0.00'});
});
