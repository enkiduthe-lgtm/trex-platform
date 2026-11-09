import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeOrderNotes} from './order-notes';
test('refresh preserves unsaved notes and updates clean notes',()=>{
 const current={a:'Taslak',b:'Eski'};
 assert.deepEqual(mergeOrderNotes(current,[{id:'a',admin_note:'Sunucu'},{id:'b',admin_note:'Yeni'},{id:'c',admin_note:null}],new Set(['a'])),{a:'Taslak',b:'Yeni',c:''});
 assert.deepEqual(current,{a:'Taslak',b:'Eski'});
});
test('older pages keep existing drafts and load their own saved notes',()=>{
 assert.deepEqual(mergeOrderNotes({a:'Taslak'},[{id:'b',admin_note:'Geçmiş Açıklama'}],new Set(['a'])),{a:'Taslak',b:'Geçmiş Açıklama'});
});
