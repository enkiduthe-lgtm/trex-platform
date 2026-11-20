import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesDealerCommission} from './dealer-commission-search';
const earned={order_number:'20261120-000001',product_name:'Bitki Çayı',sku:'TEA-01',note:'İade sonrası kalan prim',status:'CONFIRMED',entry_kind:'EARN'};

test('commission search finds order, product, SKU and Turkish note text',()=>{
 for(const query of ['20261120',' bitki ','ÇAYI','tea-01','iade sonrası',''])assert(matchesDealerCommission(earned,query,'ALL'),query);
 assert.equal(matchesDealerCommission(earned,'başka sipariş','ALL'),false);
 assert(matchesDealerCommission({...earned,note:null},'tea','ALL'));
});

test('reversals are distinct from pending and finalized earnings',()=>{
 const pending={...earned,status:'PENDING'};
 const reversal={...earned,status:'REVERSED',entry_kind:'REVERSAL'};
 assert(matchesDealerCommission(pending,'','PENDING'));
 assert.equal(matchesDealerCommission(pending,'','SETTLED'),false);
 assert(matchesDealerCommission(earned,'','SETTLED'));
 assert.equal(matchesDealerCommission(earned,'','PENDING'),false);
 assert(matchesDealerCommission(reversal,'','REVERSAL'));
 assert.equal(matchesDealerCommission(reversal,'','SETTLED'),false);
 assert.equal(matchesDealerCommission(reversal,'','PENDING'),false);
 assert.equal(matchesDealerCommission(earned,'','REVERSAL'),false);
});

test('search and status filters must match together without changing source data',()=>{
 const rows=[earned,{...earned,status:'PENDING',sku:'OTHER'}];
 assert.equal(rows.filter(row=>matchesDealerCommission(row,'OTHER','SETTLED')).length,0);
 assert.equal(rows.filter(row=>matchesDealerCommission(row,'OTHER','PENDING')).length,1);
 assert.equal(rows.length,2);
});
