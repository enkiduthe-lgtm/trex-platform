import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { PoolClient } from 'pg';

type CouponInput={code:string;discountType:'FIXED_TRY'|'PERCENT';discountValue:number;usageLimit?:number;startsAt?:string;endsAt?:string};
type CouponRow={id:string;discount_type:'FIXED_TRY'|'PERCENT';discount_value:string;usage_limit:number|null;used_count:number};
type Client=Pick<PoolClient,'query'>;
type Receipt={id:string;replayed?:boolean};
@Injectable()
export class CampaignsService {
  constructor(private readonly db:DatabaseService){}
  async list(){return (await this.db.query(`SELECT p.id,p.name,p.status,p.starts_at,p.ends_at,p.created_at,COUNT(c.id)::int AS coupon_count FROM campaigns p LEFT JOIN coupons c ON c.campaign_id=p.id GROUP BY p.id ORDER BY p.created_at DESC,p.id DESC`)).rows;}
  async listCoupons(){return (await this.db.query(`SELECT c.id,c.campaign_id,c.code,c.discount_type,c.discount_value,c.usage_limit,c.used_count,c.starts_at,c.ends_at,p.name AS campaign_name,p.status AS campaign_status FROM coupons c JOIN campaigns p ON p.id=c.campaign_id ORDER BY c.created_at DESC,c.id DESC`)).rows;}
  async create(name:string,actorId:string,startsAt?:string,endsAt?:string,key?:string){
    const title=name.trim(),window=this.validateWindow(startsAt,endsAt);
    if(!title||title.length>160)throw new BadRequestException('Kampanya adı 1–160 karakter olmalı.');
    return this.record('campaign',actorId,key,{name:title,...window},async client=>{
      const row=(await client.query<{id:string}>('INSERT INTO campaigns(name,starts_at,ends_at) VALUES($1,$2,$3) RETURNING id',[title,window.startsAt,window.endsAt])).rows[0];
      await this.audit(client,actorId,'campaign.created','campaign',row.id,{name:title});return row;
    });
  }
  async activate(id:string,actorId:string,expectedStatus?:string){return this.setStatus(id,'ACTIVE',actorId,expectedStatus);}
  async pause(id:string,actorId:string,expectedStatus?:string){return this.setStatus(id,'PAUSED',actorId,expectedStatus);}
  async createCoupon(campaignId:string,input:CouponInput,actorId:string,key?:string){
    const code=input.code.trim().toUpperCase(),window=this.validateWindow(input.startsAt,input.endsAt);
    if(!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(code))throw new BadRequestException('Çek kodunda yalnız A–Z, rakam, tire ve alt çizgi kullanın.');
    if(!['FIXED_TRY','PERCENT'].includes(input.discountType)||!Number.isInteger(input.discountValue)||input.discountValue<1||input.discountValue>1_000_000)throw new BadRequestException('Geçerli bir indirim değeri girin.');
    if(input.discountType==='PERCENT'&&input.discountValue>100)throw new BadRequestException('Yüzde indirimi 100 değerini aşamaz.');
    if(input.usageLimit!==undefined&&(!Number.isInteger(input.usageLimit)||input.usageLimit<1||input.usageLimit>2_147_483_647))throw new BadRequestException('Geçerli bir kullanım limiti girin.');
    return this.record('coupon',actorId,key,{campaignId,code,discountType:input.discountType,discountValue:input.discountValue,usageLimit:input.usageLimit??null,...window},async client=>{
      const campaign=(await client.query<{status:string}>('SELECT status FROM campaigns WHERE id=$1 FOR SHARE',[campaignId])).rows[0];
      if(!campaign)throw new NotFoundException('Kampanya bulunamadı.');
      if(campaign.status==='ARCHIVED')throw new BadRequestException('Arşivlenen kampanyaya yeni çek eklenemez.');
      const row=(await client.query<{id:string}>('INSERT INTO coupons(campaign_id,code,discount_type,discount_value,usage_limit,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[campaignId,code,input.discountType,input.discountValue,input.usageLimit??null,window.startsAt,window.endsAt])).rows[0];
      await this.audit(client,actorId,'coupon.created','coupon',row.id,{campaignId,code});return row;
    });
  }
  async previewCoupon(code:string,subtotal:number){
    if(!Number.isFinite(subtotal)||subtotal<0)throw new BadRequestException('Ara toplam sıfır veya daha büyük olmalı.');
    const result=await this.db.query<CouponRow>("SELECT c.id,c.discount_type,c.discount_value,c.usage_limit,c.used_count FROM coupons c JOIN campaigns p ON p.id=c.campaign_id WHERE upper(c.code)=upper($1) AND p.status='ACTIVE' AND (c.starts_at IS NULL OR c.starts_at<=now()) AND (c.ends_at IS NULL OR c.ends_at>now()) AND (p.starts_at IS NULL OR p.starts_at<=now()) AND (p.ends_at IS NULL OR p.ends_at>now()) LIMIT 1",[code.trim()]);
    const coupon=result.rows[0];
    if(!coupon||(coupon.usage_limit!==null&&coupon.used_count>=coupon.usage_limit))throw new NotFoundException('Çek kullanıma uygun değil.');
    const raw=coupon.discount_type==='PERCENT'?subtotal*Number(coupon.discount_value)/100:Number(coupon.discount_value);
    const discount=Math.min(subtotal,Math.round(raw*100)/100);
    return {couponId:coupon.id,code:code.trim().toUpperCase(),discount:discount.toFixed(2),total:Math.max(0,subtotal-discount).toFixed(2),currency:'TRY'};
  }
  private async record(kind:'campaign'|'coupon',actorId:string,key:string|undefined,payload:Record<string,unknown>,write:(client:Client)=>Promise<Receipt>){
    if(key!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))throw new BadRequestException('Geçerli kampanya işlem anahtarı gerekli.');
    const identity=key?`campaign-${kind}:${actorId}:${key.toLowerCase()}`:null,hash=identity?createHash('sha256').update(JSON.stringify(payload)).digest('hex'):null;
    try{return await this.db.transaction(async client=>{
      if(identity){
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[identity]);
        const prior=(await client.query<{request_hash:string;resource_type:string;resource_id:string}>('SELECT request_hash,resource_type,resource_id FROM idempotency_records WHERE key=$1',[identity])).rows[0];
        if(prior){
          if(prior.request_hash!==hash||prior.resource_type!==kind||!prior.resource_id)throw new ConflictException('Bu işlem anahtarı farklı bir kampanya kaydında kullanılmış.');
          const found=await client.query(kind==='campaign'?'SELECT id FROM campaigns WHERE id=$1':'SELECT id FROM coupons WHERE id=$1',[prior.resource_id]);
          if(!found.rowCount)throw new ConflictException('Önceki kayıt bulunamadı. Yeniden oluşturmadan listeyi kontrol edin.');
          return {id:prior.resource_id,replayed:true};
        }
      }
      const row=await write(client);
      if(identity)await client.query('INSERT INTO idempotency_records(key,request_hash,resource_type,resource_id,expires_at) VALUES($1,$2,$3,$4,now()+interval \'365 days\')',[identity,hash,kind,row.id]);
      return {...row,replayed:false};
    });}catch(error){if((error as {code?:string})?.code==='23505')throw new ConflictException('Bu çek kodu zaten kayıtlı. Mevcut çekleri kontrol edin.');throw error;}
  }
  private async setStatus(id:string,status:'ACTIVE'|'PAUSED',actorId:string,expectedStatus?:string){
    if(expectedStatus!==undefined&&!['DRAFT','ACTIVE','PAUSED','ARCHIVED'].includes(expectedStatus))throw new BadRequestException('Geçerli kampanya durumu gerekli.');
    return this.db.transaction(async client=>{
      const row=(await client.query<{id:string;status:string}>('SELECT id,status FROM campaigns WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!row)throw new NotFoundException('Kampanya bulunamadı.');
      if(row.status==='ARCHIVED')throw new ConflictException('Arşivlenen kampanyanın durumu değiştirilemez.');
      if(row.status===status)return {id,status,changed:false};
      if(expectedStatus!==undefined&&row.status!==expectedStatus)throw new ConflictException('Kampanya başka bir işlemde değişti. Listeyi yenileyin.');
      await client.query('UPDATE campaigns SET status=$2 WHERE id=$1',[id,status]);await this.audit(client,actorId,`campaign.${status.toLowerCase()}`,'campaign',id,{status,previousStatus:row.status});return {id,status,changed:true};
    });
  }
  private async audit(client:Client,actorId:string,action:string,entityType:string,entityId:string,metadata:Record<string,unknown>){await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[actorId,action,entityType,entityId,JSON.stringify(metadata)]);}
  private validateWindow(startsAt?:string,endsAt?:string){
    const parse=(value:string|undefined)=>{
      if(!value)return null;
      if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value))throw new BadRequestException('Geçerli bir kampanya tarihi girin.');
      const day=value.slice(0,10),calendar=new Date(day+'T00:00:00Z');
      if(Number.isNaN(calendar.getTime())||calendar.toISOString().slice(0,10)!==day||Number(value.slice(11,13))>23)throw new BadRequestException('Geçerli bir kampanya tarihi girin.');
      const normalized=/(?:Z|[+-]\d{2}:\d{2})$/.test(value)?value:value+'+03:00',date=new Date(normalized);
      if(Number.isNaN(date.getTime()))throw new BadRequestException('Geçerli bir kampanya tarihi girin.');
      return date.toISOString();
    };
    const start=parse(startsAt),end=parse(endsAt);
    if(start&&end&&end<=start)throw new BadRequestException('Kampanya bitişi başlangıçtan sonra olmalı.');
    return {startsAt:start,endsAt:end};
  }
}
