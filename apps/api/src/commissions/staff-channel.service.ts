import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { WalletClient, moneyCents } from './dealer-wallet';

type Settings={id:string;executive_count:number;executive_ids:string[];director_id:string};
export const staffMoney=(cents:bigint)=>`${cents/100n}.${String(cents%100n).padStart(2,'0')}`;
@Injectable()
export class StaffChannelService {
 constructor(private readonly db:DatabaseService){}
 async access(actor:RequestUser){
  const participant=await this.db.query<{executive:boolean;director:boolean}>(`SELECT COALESCE(bool_or($1::uuid=ANY(executive_ids)),false) AS executive,COALESCE(bool_or(director_id=$1),false) AS director FROM staff_prim_settings`,[actor.id]);
  const restricted=participant.rows[0].executive||participant.rows[0].director;
  return {canManage:actor.role==='SUPER_ADMIN'&&!restricted,canSeeAll:['SUPER_ADMIN','FINANCE'].includes(actor.role)&&!restricted};
 }
 async settings(dto:{executiveCount:number;executiveIds:string[];directorId:string},actor:RequestUser){
  if(!(await this.access(actor)).canManage)throw new ForbiddenException('Bu Ayarı Yalnız Yetkili Merkez Hesabı Değiştirebilir');
  const ids=[...new Set(dto.executiveIds)].sort();
  if(ids.length!==dto.executiveCount||ids.includes(dto.directorId))throw new BadRequestException('Kişi Sayısı Kadar Farklı Yönetici Ve Ayrı Bir Müdür Seçin');
  return this.db.transaction(async client=>{
   await client.query("SELECT pg_advisory_xact_lock(hashtext('staff-prim-settings'))");
   const users=await client.query("SELECT id FROM users WHERE id=ANY($1::uuid[]) AND is_active=true AND role IN ('SUPER_ADMIN','ADMIN','FINANCE')",[[...ids,dto.directorId]]);
   if(users.rowCount!==ids.length+1)throw new BadRequestException('Aktif Panel Hesaplarını Seçin');
   const result=await client.query('INSERT INTO staff_prim_settings(executive_count,executive_ids,director_id,created_by) VALUES($1,$2,$3,$4) RETURNING id',[dto.executiveCount,ids,dto.directorId,actor.id]);
   await client.query("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,'commission.staff.settings','staff_prim_settings',$2,$3)",[actor.id,result.rows[0].id,JSON.stringify(dto)]);
   return result.rows[0];
  });
 }
 async rate(dto:{productId:string;channelGroup:string;executiveAmount:number;directorAmount:number},actor:RequestUser){
  if(!(await this.access(actor)).canManage)throw new ForbiddenException('Prim Tutarlarını Yalnız Yetkili Merkez Hesabı Değiştirebilir');
  return this.db.transaction(async client=>{
   if(!(await client.query('SELECT id FROM products WHERE id=$1 AND is_active=true',[dto.productId])).rowCount)throw new BadRequestException('Aktif Ürün Seçin');
   await client.query("SELECT pg_advisory_xact_lock(hashtext('staff-prim-rates'))");
   const row=await client.query('INSERT INTO staff_prim_rates(product_id,channel_group,executive_amount,director_amount,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[dto.productId,dto.channelGroup,dto.executiveAmount,dto.directorAmount,actor.id]);
   await client.query("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,'commission.staff.rate','staff_prim_rate',$2,$3)",[actor.id,row.rows[0].id,JSON.stringify(dto)]);
   return row.rows[0];
  });
 }
 async view(actor:RequestUser,month?:string){
  if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new BadRequestException('Geçerli Ay Seçin');
  const permissions=await this.access(actor);
  const entries=await this.db.query(`SELECT e.id,e.recipient_user_id,e.staff_role,e.staff_channel_group,e.staff_unit_amount,e.staff_share_count,e.staff_paid_amount,e.amount,e.currency,e.status,e.entry_kind,e.created_at,e.finalized_at,e.paid_at,e.note,o.order_number,oi.product_name,oi.sku,oi.quantity,u.email AS recipient_email
   FROM commission_entries e JOIN orders o ON o.id=e.order_id JOIN order_items oi ON oi.id=e.order_item_id JOIN users u ON u.id=e.recipient_user_id
   WHERE e.calculation_source='STAFF_CHANNEL_POOL_V1' AND ($1::boolean OR e.recipient_user_id=$2)
   AND ($3::text IS NULL OR to_char(e.created_at AT TIME ZONE 'Europe/Istanbul','YYYY-MM')=$3)
   ORDER BY e.created_at DESC,e.id`,[permissions.canSeeAll,actor.id,month??null]);
  // Restricted participants never receive the other role's rates, identity or earnings.
  if(!permissions.canManage)return {...permissions,settings:null,rates:[],users:[],products:[],entries:entries.rows};
  const [settings,rates,users,products]=await Promise.all([
   this.db.query<Settings>('SELECT id,executive_count,executive_ids,director_id FROM staff_prim_settings ORDER BY created_at DESC,id DESC LIMIT 1'),
   this.db.query(`SELECT DISTINCT ON(r.product_id,r.channel_group) r.*,p.name AS product_name,p.sku FROM staff_prim_rates r JOIN products p ON p.id=r.product_id ORDER BY r.product_id,r.channel_group,r.created_at DESC,r.id DESC`),
   this.db.query("SELECT id,email FROM users WHERE is_active=true AND role IN ('SUPER_ADMIN','ADMIN','FINANCE') ORDER BY email"),
   this.db.query('SELECT id,name,sku FROM products WHERE is_active=true ORDER BY name')]);
  return {...permissions,settings:settings.rows[0]??null,rates:rates.rows,users:users.rows,products:products.rows,entries:entries.rows};
 }
 async authorizeEntry(id:string,actor:RequestUser){
  const row=await this.db.query("SELECT id FROM commission_entries WHERE id=$1 AND calculation_source='STAFF_CHANNEL_POOL_V1'",[id]);
  if(row.rowCount&&!(await this.access(actor)).canSeeAll)throw new ForbiddenException('Bu Prim İşlemine Yetkiniz Yok');
 }
 async payIfPooled(id:string,dto:{accountId:string;referenceNumber?:string},actor:RequestUser){
  if(!(await this.db.query("SELECT id FROM commission_entries WHERE id=$1 AND calculation_source='STAFF_CHANNEL_POOL_V1'",[id])).rowCount)return null;
  await this.authorizeEntry(id,actor);
  return this.db.transaction(async client=>{
   const entry=(await client.query<{id:string;order_id:string;status:string;amount:string;recipient_email:string;finance_transaction_id:string|null}>("SELECT e.id,e.order_id,e.status,e.amount,e.finance_transaction_id,u.email AS recipient_email FROM commission_entries e JOIN users u ON u.id=e.recipient_user_id WHERE e.id=$1 AND e.entry_kind='EARN' FOR UPDATE OF e",[id])).rows[0];
   if(!entry)throw new BadRequestException('Prim Kaydı Bulunamadı');
   if(entry.status==='PAID')return {id,status:'PAID',financeTransactionId:entry.finance_transaction_id};
   if(entry.status!=='CONFIRMED')throw new ConflictException('Yalnız Kesinleşmiş Prim Ödenebilir');
   const reversed=(await client.query<{amount:string}>("SELECT COALESCE(SUM(amount),0)::text AS amount FROM commission_entries WHERE source_entry_id=$1 AND entry_kind='REVERSAL'",[id])).rows[0];
   const cents=moneyCents(entry.amount)+moneyCents(reversed.amount);
   if(cents<=0n)throw new ConflictException('Bu Hakedişin Tamamı Kesilmiş');
   const account=await client.query("SELECT id FROM finance_accounts WHERE id=$1 AND currency='TRY' AND is_active=true FOR UPDATE",[dto.accountId]);
   if(!account.rowCount)throw new BadRequestException('Aktif TL Ödeme Hesabı Seçin');
   const amount=staffMoney(cents),transaction=await client.query<{id:string}>("INSERT INTO finance_transactions(account_id,order_id,kind,amount,payment_status,counterparty_name,reference_number,description,created_by) VALUES($1,$2,'PRIME_EXPENSE',$3,'PAID',$4,$5,'Yönetim Prim Ödemesi',$6) RETURNING id",[dto.accountId,entry.order_id,amount,entry.recipient_email,dto.referenceNumber?.trim()||null,actor.id]);
   await client.query("UPDATE commission_entries SET status='PAID',paid_at=now(),paid_by=$1,finance_transaction_id=$2,staff_paid_amount=$3 WHERE id=$4",[actor.id,transaction.rows[0].id,amount,id]);
   return {id,status:'PAID',financeTransactionId:transaction.rows[0].id};
  });
 }
 async award(client:WalletClient,orderId:string,group:string){
  const order=(await client.query<{created_at:Date;status:string;currency:string}>('SELECT created_at,status,currency FROM orders WHERE id=$1',[orderId])).rows[0];
  if(!order||order.status!=='DELIVERED')throw new BadRequestException('Prim İçin Teslim Edilmiş Sipariş Gerekli');
  const settings=(await client.query<Settings>('SELECT id,executive_count,executive_ids,director_id FROM staff_prim_settings WHERE created_at<=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[order.created_at])).rows[0];
  if(!settings)return {handled:false,created:0};
  // These are fixed TL-per-unit rates, regardless of the order's sale currency.
  const items=await client.query<{id:string;product_id:string;quantity:number}>('SELECT id,product_id,quantity FROM order_items WHERE order_id=$1 ORDER BY id FOR UPDATE',[orderId]);
  let created=0;
  for(const item of items.rows){
   const rate=(await client.query<{id:string;executive_amount:string;director_amount:string}>('SELECT id,executive_amount,director_amount FROM staff_prim_rates WHERE product_id=$1 AND channel_group=$2 AND created_at<=$3 ORDER BY created_at DESC,id DESC LIMIT 1',[item.product_id,group,order.created_at])).rows[0];
   if(!rate)continue;
   const pool=moneyCents(rate.executive_amount)*BigInt(item.quantity),count=BigInt(settings.executive_count);
   const recipients=settings.executive_ids.slice().sort().map((id,index)=>({id,role:'EXECUTIVE',unit:rate.executive_amount,pool,amount:pool/count+(BigInt(index)<pool%count?1n:0n),count:settings.executive_count}));
   recipients.push({id:settings.director_id,role:'DIRECTOR',unit:rate.director_amount,pool:moneyCents(rate.director_amount)*BigInt(item.quantity),amount:moneyCents(rate.director_amount)*BigInt(item.quantity),count:1});
   for(const recipient of recipients){
    if(recipient.amount===0n)continue;
    const row=await client.query(`INSERT INTO commission_entries(recipient_user_id,recipient_kind,order_id,order_item_id,amount,currency,status,entry_kind,available_at,finalized_at,calculation_source,staff_settings_id,staff_rate_id,staff_role,staff_channel_group,staff_unit_amount,staff_pool_amount,staff_share_count,note)
     VALUES($1,$2,$3,$4,$5,'TRY','CONFIRMED','EARN',now(),now(),'STAFF_CHANNEL_POOL_V1',$6,$7,$8,$9,$10,$11,$12,'Teslim Edilen Sipariş Primi') ON CONFLICT DO NOTHING RETURNING id`,[recipient.id,recipient.role==='EXECUTIVE'?'MANAGER':'STAFF',orderId,item.id,staffMoney(recipient.amount),settings.id,rate.id,recipient.role,group,recipient.unit,staffMoney(recipient.pool),recipient.count]);
    created+=row.rowCount??0;
   }
  }
  return {handled:true,created};
 }
}
