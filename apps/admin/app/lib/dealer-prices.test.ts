import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveDealerPrice,effectivePublicPrice,type DealerPrice} from './dealer-prices';
const now=new Date('2026-11-09T12:00:00Z');
const base:DealerPrice={id:'a',product_id:'p',dealer_level_id:'l',scope:'GLOBAL',amount:'10.00',currency:'TRY',starts_at:'2026-01-01T00:00:00Z',ends_at:null};
test('public display prefers site price and ignores other channels, future and expired prices',()=>{
 const rows=[base,{...base,id:'site',scope:'CHANNEL',channel:'PUBLIC_WEB',amount:'12.00'},{...base,id:'other',scope:'CHANNEL',channel:'INSTAGRAM'},{...base,id:'future',starts_at:'2027-01-01'},{...base,id:'expired',ends_at:'2026-01-02'}];
 assert.equal(effectivePublicPrice(rows,'p',now)?.id,'site');
 assert.equal(effectivePublicPrice(rows,'other',now),undefined);
});
test('equal effective dates use creation time before id for both level and site prices',()=>{
 const older={...base,id:'z',created_at:'2026-02-01'};
 const newer={...base,id:'b',created_at:'2026-03-01'};
 assert.equal(effectivePublicPrice([older,newer],'p',now)?.id,'b');
 assert.equal(effectiveDealerPrice([older,newer].map(row=>({...row,scope:'DEALER_LEVEL',pack_size:2})),'p','l',2,now)?.id,'b');
 assert.equal(effectiveDealerPrice([{...newer,scope:'DEALER_LEVEL',pack_size:2}],'p','l',1,now),undefined);
});
