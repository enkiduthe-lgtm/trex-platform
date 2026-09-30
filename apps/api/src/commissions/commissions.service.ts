import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
@Injectable()
export class CommissionsService {
  constructor(private readonly db: DatabaseService) {}
  async createRule(dto: CreateCommissionRuleDto) { return (await this.db.query<{ id: string }>('INSERT INTO commission_rules (dealer_level_id,product_id,amount_per_unit) VALUES ($1,$2,$3) RETURNING id', [dto.dealerLevelId ?? null, dto.productId ?? null, dto.amountPerUnit])).rows[0]; }
  async confirmForOrderItem(input: { dealerId: string; orderId: string; orderItemId: string; productId: string; quantity: number }) {
    const rule = await this.db.query<{ id: string; amount_per_unit: string }>("SELECT id,amount_per_unit FROM commission_rules WHERE (product_id=$1 OR product_id IS NULL) AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()) ORDER BY product_id NULLS LAST, starts_at DESC LIMIT 1", [input.productId]);
    if (!rule.rows[0]) return null;
    const entry = await this.db.query<{ id: string; amount: string }>("INSERT INTO commission_entries (dealer_id,order_id,order_item_id,rule_id,amount,status,available_at) VALUES ($1,$2,$3,$4,$5,'CONFIRMED',now()) ON CONFLICT (dealer_id,order_item_id,rule_id) DO NOTHING RETURNING id,amount", [input.dealerId, input.orderId, input.orderItemId, rule.rows[0].id, Number(rule.rows[0].amount_per_unit) * input.quantity]); return entry.rows[0] ?? null;
  }
  async reverse(entryId: string) { const entry = await this.db.query("UPDATE commission_entries SET status='REVERSED',reversed_at=now() WHERE id=$1 AND status IN ('PENDING','CONFIRMED','AVAILABLE') RETURNING id", [entryId]); if (!entry.rowCount) throw new NotFoundException('Reversible commission entry not found'); return entry.rows[0]; }
}
