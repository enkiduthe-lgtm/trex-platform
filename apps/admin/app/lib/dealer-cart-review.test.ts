import test from 'node:test';
import assert from 'node:assert/strict';
import {dealerCartIssue} from './dealer-cart-review';
const product={id:'tea',amount:'100.00',currency:'TRY',available_quantity:10,packs:[{size:2,amount:'180.00'},{size:5,amount:'400.00'}]};
const line={productId:'tea',currency:'TRY',quantity:2,baseAmount:'100.00'};
test('unchanged prices compare as exact cents and keep valid cart lines usable',()=>{
 assert.equal(dealerCartIssue(line,product),null);
 assert.equal(dealerCartIssue({...line,baseAmount:'100'},product),null);
 assert.equal(dealerCartIssue({...line,packSize:2,baseAmount:'180.00'},product),null);
});
test('both increasing and decreasing level prices require review without changing the sale',()=>{
 assert.equal(dealerCartIssue(line,{...product,amount:'110.00'})?.kind,'PRICE');
 assert.equal(dealerCartIssue(line,{...product,amount:'90.00'})?.kind,'PRICE');
 assert.equal(dealerCartIssue({...line,packSize:2,baseAmount:'179.99'},product)?.kind,'PRICE');
 assert.equal(line.baseAmount,'100.00');
});
test('missing products, removed packages and changed currencies cannot silently reuse old prices',()=>{
 assert.equal(dealerCartIssue(line,undefined)?.kind,'UNAVAILABLE');
 assert.equal(dealerCartIssue(line,{...product,amount:null})?.kind,'UNAVAILABLE');
 assert.equal(dealerCartIssue({...line,packSize:3,baseAmount:'250.00'},product)?.kind,'UNAVAILABLE');
 assert.equal(dealerCartIssue(line,{...product,currency:'EUR'})?.kind,'CURRENCY');
});
test('stock review uses actual units in a multipack while unknown stock remains server-validated',()=>{
 assert.equal(dealerCartIssue({...line,packSize:5,baseAmount:'400.00',quantity:15},product)?.kind,'STOCK');
 assert.equal(dealerCartIssue({...line,packSize:5,baseAmount:'400.00',quantity:10},product),null);
 assert.equal(dealerCartIssue(line,{...product,available_quantity:undefined}),null);
});
