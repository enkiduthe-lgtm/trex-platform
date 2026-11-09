import test from 'node:test';
import assert from 'node:assert/strict';
import {dealerPackSummary} from './dealer-pack-summary';
import type {DealerPrice} from './dealer-prices';
const pack={amount:'1059.99',currency:'TRY'} as DealerPrice;
test('package advantage uses actual pack total and single price',()=>{
 const result=dealerPackSummary(pack,{...pack,amount:'749.99'},2);
 assert.ok(result?.unitPrice.includes('530,00'));
 assert.ok(result?.saving?.includes('439,99'));
});
test('missing or different currency single price never invents savings',()=>{
 assert.equal(dealerPackSummary(pack,undefined,2)?.saving,null);
 assert.equal(dealerPackSummary(pack,{...pack,currency:'EUR'},2)?.saving,null);
 assert.equal(dealerPackSummary(pack,{...pack,amount:'400'},2)?.saving,null);
 assert.equal(dealerPackSummary(pack,undefined,0),null);
});
