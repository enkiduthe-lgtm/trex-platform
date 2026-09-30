import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type CouponInput = { code: string; discountType: 'FIXED_TRY' | 'PERCENT'; discountValue: number; usageLimit?: number; startsAt?: string; endsAt?: string };
type CouponRow = { id:string; discount_type:'FIXED_TRY'|'PERCENT'; discount_value:string; usage_limit:number|null; used_count:number };

@Injectable()
export class CampaignsService {
  constructor(private readonly db: DatabaseService) {}
  async list() { return (await this.db.query('SELECT id,name,status,starts_at,ends_at,created_at FROM campaigns ORDER BY created_at DESC')).rows; }
  async create(name: string, actorId: string, startsAt?: string, endsAt?: string) {
    this.validateWindow(startsAt, endsAt);
    const campaign=(await this.db.query<{ id: string }>('INSERT INTO campaigns (name,starts_at,ends_at) VALUES ($1,$2,$3) RETURNING id', [name, startsAt ?? null, endsAt ?? null])).rows[0]; await this.audit(actorId,'campaign.created','campaign',campaign.id,{name}); return campaign;
  }
  async activate(id: string, actorId:string) { return this.setStatus(id, 'ACTIVE',actorId); }
  async pause(id: string, actorId:string) { return this.setStatus(id, 'PAUSED',actorId); }
  async createCoupon(campaignId: string, input: CouponInput, actorId:string) {
    if (input.discountType === 'PERCENT' && input.discountValue > 100) throw new BadRequestException('Percentage discount cannot exceed 100');
    this.validateWindow(input.startsAt, input.endsAt);
    const campaign = await this.db.query('SELECT 1 FROM campaigns WHERE id=$1', [campaignId]);
    if (!campaign.rowCount) throw new NotFoundException('Campaign not found');
    const coupon=(await this.db.query<{ id: string }>('INSERT INTO coupons (campaign_id,code,discount_type,discount_value,usage_limit,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [campaignId, input.code.toUpperCase(), input.discountType, input.discountValue, input.usageLimit ?? null, input.startsAt ?? null, input.endsAt ?? null])).rows[0]; await this.audit(actorId,'coupon.created','coupon',coupon.id,{campaignId,code:input.code.toUpperCase()}); return coupon;
  }
  async previewCoupon(code: string, subtotal: number) {
    if (!Number.isFinite(subtotal) || subtotal < 0) throw new BadRequestException('Subtotal must be zero or greater');
    const result = await this.db.query<CouponRow>("SELECT c.id,c.discount_type,c.discount_value,c.usage_limit,c.used_count FROM coupons c JOIN campaigns p ON p.id=c.campaign_id WHERE upper(c.code)=upper($1) AND p.status='ACTIVE' AND (c.starts_at IS NULL OR c.starts_at<=now()) AND (c.ends_at IS NULL OR c.ends_at>now()) AND (p.starts_at IS NULL OR p.starts_at<=now()) AND (p.ends_at IS NULL OR p.ends_at>now()) LIMIT 1", [code]);
    const coupon=result.rows[0];
    if (!coupon || (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit)) throw new NotFoundException('Coupon is not available');
    const raw=coupon.discount_type==='PERCENT' ? subtotal * Number(coupon.discount_value) / 100 : Number(coupon.discount_value);
    const discount=Math.min(subtotal, Math.round(raw * 100) / 100);
    return { couponId:coupon.id, code:code.toUpperCase(), discount:discount.toFixed(2), total:Math.max(0,subtotal-discount).toFixed(2), currency:'TRY' };
  }
  private async setStatus(id: string, status: 'ACTIVE' | 'PAUSED', actorId:string) { const result = await this.db.query<{ id: string }>('UPDATE campaigns SET status=$2 WHERE id=$1 RETURNING id', [id, status]); if (!result.rowCount) throw new NotFoundException('Campaign not found'); await this.audit(actorId,`campaign.${status.toLowerCase()}`,'campaign',id,{status}); return result.rows[0]; }
  private async audit(actorId:string,action:string,entityType:string,entityId:string,metadata:Record<string,unknown>){await this.db.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[actorId,action,entityType,entityId,JSON.stringify(metadata)]);}
  private validateWindow(startsAt?: string, endsAt?: string) { if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new BadRequestException('Campaign end must be after its start'); }
}
