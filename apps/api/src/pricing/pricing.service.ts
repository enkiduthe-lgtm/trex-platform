import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { CreatePriceDto, PriceScope, SalesChannel } from './dto/create-price.dto';

export interface PriceRow { id: string; product_id: string; amount: string; currency: string; scope: PriceScope; channel: SalesChannel | null; dealer_level_id: string | null; dealer_id: string | null; starts_at: Date; }
export interface ResolvedPrice { amount: string; currency: string; source: PriceScope; ruleId: string; effectiveAt: Date; }
@Injectable()
export class PricingService {
  constructor(private readonly db: DatabaseService) {}
  private targetIsValid(dto: CreatePriceDto) {
    return (dto.scope === PriceScope.GLOBAL && !dto.channel && !dto.dealerLevelId && !dto.dealerId) ||
      (dto.scope === PriceScope.CHANNEL && !!dto.channel && !dto.dealerLevelId && !dto.dealerId) ||
      (dto.scope === PriceScope.DEALER_LEVEL && !dto.channel && !!dto.dealerLevelId && !dto.dealerId) ||
      (dto.scope === PriceScope.DEALER && !dto.channel && !dto.dealerLevelId && !!dto.dealerId);
  }
  async create(dto: CreatePriceDto, actor: RequestUser) {
    if (!this.targetIsValid(dto)) throw new BadRequestException('Price scope and target do not match');
    if (dto.endsAt && new Date(dto.endsAt) <= new Date(dto.startsAt ?? Date.now())) throw new BadRequestException('endsAt must be after startsAt');
    const result = await this.db.query<PriceRow>('INSERT INTO product_prices (product_id, scope, channel, dealer_level_id, dealer_id, amount, currency, starts_at, ends_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [dto.productId, dto.scope, dto.channel ?? null, dto.dealerLevelId ?? null, dto.dealerId ?? null, dto.amount, dto.currency ?? 'TRY', dto.startsAt ?? new Date(), dto.endsAt ?? null, actor.id]);
    await this.db.query('INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1,$2,$3,$4)', [actor.id, 'price.created', 'product_price', result.rows[0].id]); return result.rows[0];
  }
  async resolve(productId: string, context: { channel: SalesChannel; dealerLevelId?: string; dealerId?: string }): Promise<ResolvedPrice | null> {
    const result = await this.db.query<PriceRow>(`SELECT * FROM product_prices WHERE product_id=$1 AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()) AND (
      (scope='DEALER' AND dealer_id=$2) OR (scope='DEALER_LEVEL' AND dealer_level_id=$3) OR (scope='CHANNEL' AND channel=$4) OR scope='GLOBAL'
    ) ORDER BY CASE scope WHEN 'DEALER' THEN 1 WHEN 'DEALER_LEVEL' THEN 2 WHEN 'CHANNEL' THEN 3 ELSE 4 END, starts_at DESC LIMIT 1`, [productId, context.dealerId ?? null, context.dealerLevelId ?? null, context.channel]);
    const price = result.rows[0]; return price ? { amount: price.amount, currency: price.currency, source: price.scope, ruleId: price.id, effectiveAt: price.starts_at } : null;
  }
}
