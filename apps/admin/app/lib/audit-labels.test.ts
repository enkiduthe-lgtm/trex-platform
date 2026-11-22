import test from 'node:test';
import assert from 'node:assert/strict';
import { auditActionLabel, auditActionLabels } from './audit-labels';

test('audit labels explain commission and carrier actions without changing their codes',()=>{
  assert.equal(auditActionLabel('commission.rule.updated'),'Personel Prim Kuralı Düzenlendi');
  assert.equal(auditActionLabel('commission.reversed'),'Prim İçin Ters Kayıt Oluşturuldu');
  assert.equal(auditActionLabel('shipment.aras.order_reconciled'),'Sipariş Aras Teslimi İle Eşleştirildi');
  assert.equal(auditActionLabel('order.list.deleted'),'Sipariş Listeden Kaldırıldı');
  assert(Object.isFrozen(auditActionLabels));
});
test('unknown and prototype-like audit codes remain unclassified',()=>{
  for(const value of ['new.action','constructor','__proto__','toString','=synthetic.action','ORDER.ADMIN.CREATED'])assert.equal(auditActionLabel(value),'Diğer İşlem');
});
