import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { dealerWallet, moneyCents, WalletClient } from '../commissions/dealer-wallet';
@Injectable()
export class DealerPayoutsService {
 constructor(private readonly db:DatabaseService) {}
 private async dealerForUser(userId:string,client:WalletClient=this.db) {
  const row=(await client.query<{dealer_id:string}>('SELECT dealer_id FROM dealer_user_accounts WHERE user_id=$1',[userId])).rows[0];
  if(!row)throw new NotFoundException('Bayi Hesabı Bulunamadı');return row.dealer_id;
 }
 async portal(userId:string) {
  const id=await this.dealerForUser(userId);
  const [balance,requests,deductions,earnings,sales,spends]=await Promise.all([
   dealerWallet(this.db,id),
   this.db.query('SELECT id,amount,currency,status,due_date,created_at,paid_at,reference_number,note FROM dealer_prim_requests WHERE dealer_id=$1 ORDER BY created_at DESC',[id]),
   this.db.query('SELECT f.id,f.amount,f.currency,f.note,f.created_at,o.order_number FROM dealer_prim_deductions f JOIN returns r ON r.id=f.return_id JOIN orders o ON o.id=r.order_id WHERE f.dealer_id=$1 ORDER BY f.created_at DESC',[id]),
   this.db.query('SELECT e.id,e.amount,e.currency,e.status,e.entry_kind,e.created_at,e.available_at,e.note,o.order_number,oi.product_name,oi.sku,oi.quantity,oi.unit_amount FROM commission_entries e JOIN orders o ON o.id=e.order_id JOIN order_items oi ON oi.id=e.order_item_id WHERE e.dealer_id=$1 ORDER BY e.created_at DESC,e.id',[id]),
   this.db.query(`SELECT to_char(o.created_at AT TIME ZONE 'Europe/Istanbul','YYYY-MM') AS month,o.currency,count(*)::int AS order_count,SUM(o.total_amount)::text AS amount FROM orders o WHERE o.status NOT IN ('CANCELLED','REFUNDED') AND EXISTS(SELECT 1 FROM audit_logs a WHERE a.entity_id=o.id AND a.entity_type='order' AND a.action='order.dealer.created' AND a.metadata->>'dealerId'=$1::text) GROUP BY month,o.currency ORDER BY month DESC`,[id]),
   this.db.query(`SELECT s.id,s.amount,'TRY' AS currency,s.created_at,o.order_number,'SPEND' AS kind FROM dealer_commission_spends s JOIN orders o ON o.id=s.order_id WHERE s.dealer_id=$1 UNION ALL SELECT f.id,f.amount,'TRY',f.created_at,o.order_number,'REFUND' FROM dealer_prim_refunds f JOIN orders o ON o.id=f.order_id WHERE f.dealer_id=$1 ORDER BY created_at DESC`,[id]),
  ]);
  return {balance,requests:requests.rows,deductions:deductions.rows,earnings:earnings.rows,sales:sales.rows,spends:spends.rows};
 }
 async request(userId:string,requestKey:string,amount:number) {
  return this.db.transaction(async client=>{
   const dealerId=await this.dealerForUser(userId,client);
   await client.query('SELECT id FROM dealers WHERE id=$1 FOR UPDATE',[dealerId]);
   const old=await client.query<{id:string;amount:string;dealer_id:string}>('SELECT id,amount,dealer_id FROM dealer_prim_requests WHERE request_key=$1',[requestKey]);
   if(old.rows[0]){if(old.rows[0].dealer_id!==dealerId||moneyCents(old.rows[0].amount)!==moneyCents(amount.toFixed(2)))throw new ConflictException('İşlem Anahtarı Başka Talepte Kullanılmış');return {id:old.rows[0].id};}
   const balance=await dealerWallet(client,dealerId);
   if(moneyCents(amount.toFixed(2))>moneyCents(balance.eligible))throw new ConflictException('Önceki Aylardan Talep Edilebilir Prim Yetersiz');
   const bank=(await client.query<{account_holder:string;iban:string}>('SELECT account_holder,iban FROM dealer_bank_accounts WHERE dealer_id=$1 AND is_primary=true',[dealerId])).rows[0];
   if(!bank)throw new ConflictException('Nakit Prim Talebi İçin Yöneticiye IBAN Ve Hesap Adınızı Kaydettirin. Ürün Siparişinde IBAN Gerekmez.');
   return (await client.query("INSERT INTO dealer_prim_requests(request_key,dealer_id,amount,account_holder,iban,requested_by,due_date) VALUES($1,$2,$3,$4,$5,$6,(date_trunc('month',now() AT TIME ZONE 'Europe/Istanbul')+CASE WHEN extract(day FROM now() AT TIME ZONE 'Europe/Istanbul')>5 THEN interval '1 month' ELSE interval '0 month' END+interval '4 days')::date) RETURNING id",[requestKey,dealerId,amount,bank.account_holder,bank.iban,userId])).rows[0];
  });
 }
 async list() {return (await this.db.query('SELECT r.*,d.company_name,d.code AS dealer_code FROM dealer_prim_requests r JOIN dealers d ON d.id=r.dealer_id ORDER BY r.due_date,r.created_at')).rows;}
 async returnFee(returnId:string,amount:number,note:string,actorId:string) {
  return this.db.transaction(async client=>{
   const returned=(await client.query<{order_id:string;currency:string;dealer_id:string}>(`SELECT r.order_id,o.currency,(SELECT (a.metadata->>'dealerId')::uuid FROM audit_logs a WHERE a.entity_id=o.id AND a.entity_type='order' AND a.action='order.dealer.created' ORDER BY a.created_at LIMIT 1) AS dealer_id FROM returns r JOIN orders o ON o.id=r.order_id WHERE r.id=$1 AND r.status IN ('RECEIVED','INSPECTED','REFUNDED')`,[returnId])).rows[0];
   if(!returned?.dealer_id)throw new ConflictException('Teslim Alınmış Bayi İadesi Bulunamadı');
   await client.query('SELECT id FROM dealers WHERE id=$1 FOR UPDATE',[returned.dealer_id]);
   const fee=await client.query('INSERT INTO dealer_prim_deductions(dealer_id,return_id,amount,currency,note,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(return_id) DO NOTHING RETURNING id',[returned.dealer_id,returnId,amount,returned.currency,note.trim(),actorId]);
   if(!fee.rowCount)throw new ConflictException('Bu İadenin Kargo Kesintisi Zaten Kaydedilmiş');
   return fee.rows[0];
  });
 }
 async decide(id:string,status:'APPROVED'|'REJECTED',actorId:string,note?:string) {
  return this.db.transaction(async client=>{
   const request=(await client.query<{dealer_id:string}>('SELECT dealer_id FROM dealer_prim_requests WHERE id=$1',[id])).rows[0];if(!request)throw new NotFoundException('Talep Bulunamadı');
   await client.query('SELECT id FROM dealers WHERE id=$1 FOR UPDATE',[request.dealer_id]);
   const result=await client.query("UPDATE dealer_prim_requests SET status=$1,approved_by=$2,approved_at=now(),note=$3 WHERE id=$4 AND status=ANY($5::text[]) RETURNING id",[status,actorId,note?.trim()||null,id,status==='APPROVED'?['REQUESTED']:['REQUESTED','APPROVED']]);
   if(!result.rowCount)throw new ConflictException('Talep Bu İşlem İçin Uygun Değil');return result.rows[0];
  });
 }
 async pay(id:string,accountId:string,reference:string,actorId:string) {
  return this.db.transaction(async client=>{
   const target=(await client.query<{dealer_id:string}>('SELECT dealer_id FROM dealer_prim_requests WHERE id=$1',[id])).rows[0];if(!target)throw new NotFoundException('Talep Bulunamadı');
   await client.query('SELECT id FROM dealers WHERE id=$1 FOR UPDATE',[target.dealer_id]);
   const row=(await client.query<{dealer_id:string;status:string;amount:string;currency:string;account_holder:string;due:boolean;finance_transaction_id:string|null}>("SELECT *,due_date<=(now() AT TIME ZONE 'Europe/Istanbul')::date AS due FROM dealer_prim_requests WHERE id=$1 FOR UPDATE",[id])).rows[0];
   if(row.status==='PAID')return {id,financeTransactionId:row.finance_transaction_id,replayed:true};
   if(row.status!=='APPROVED'||!row.due)throw new ConflictException('Onaylı Talep Ödeme Gününden Önce Ödenemez');
   const balance=await dealerWallet(client,row.dealer_id,row.currency,id);
   if(moneyCents(row.amount)>moneyCents(balance.available)||moneyCents(row.amount)>moneyCents(balance.eligible))throw new ConflictException('İade Veya Kesinti Sonrası Prim Yetersiz. Talebi Reddedip Uygun Tutarla Yeniden Oluşturun.');
   const account=await client.query('SELECT id FROM finance_accounts WHERE id=$1 AND currency=$2 AND is_active=true FOR UPDATE',[accountId,row.currency]);if(!account.rowCount)throw new ConflictException('Aynı Para Biriminde Aktif Ödeme Hesabı Seçin');
   const transaction=(await client.query<{id:string}>("INSERT INTO finance_transactions(account_id,kind,amount,payment_status,counterparty_name,reference_number,description,created_by) VALUES($1,'PRIME_EXPENSE',$2,'PAID',$3,$4,$5,$6) RETURNING id",[accountId,row.amount,row.account_holder,reference.trim(),'Bayi Aylık Prim Ödemesi '+id,actorId])).rows[0];
   await client.query("UPDATE dealer_prim_requests SET status='PAID',paid_by=$1,paid_at=now(),finance_transaction_id=$2,reference_number=$3 WHERE id=$4",[actorId,transaction.id,reference.trim(),id]);return {id,financeTransactionId:transaction.id};
  });
 }
}
