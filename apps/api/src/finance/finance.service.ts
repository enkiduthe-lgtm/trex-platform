import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { CreateFinanceRecordDto } from './dto/create-finance-record.dto';
@Injectable()
export class FinanceService {
  constructor(private readonly db: DatabaseService) {}
  async list() { return (await this.db.query('SELECT r.*,u.email AS created_by_email FROM admin_finance_records r JOIN users u ON u.id=r.created_by ORDER BY r.occurred_at DESC, r.created_at DESC')).rows; }
  async create(dto: CreateFinanceRecordDto, actor: RequestUser) {
    const result = await this.db.query<{ id: string }>('INSERT INTO admin_finance_records(kind,amount,occurred_at,counterparty_name,bank_name,reference_number,description,created_by) VALUES ($1,$2,COALESCE($3::timestamptz,now()),$4,$5,$6,$7,$8) RETURNING id', [dto.kind, dto.amount, dto.occurredAt ?? null, dto.counterpartyName?.trim() || null, dto.bankName?.trim() || null, dto.referenceNumber?.trim() || null, dto.description.trim(), actor.id]);
    await this.db.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [actor.id, `finance.${dto.kind.toLowerCase()}.created`, 'admin_finance_record', result.rows[0].id]);
    return result.rows[0];
  }
}
