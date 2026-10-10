import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { CreateCurrentAccountEntryDto } from './dto/create-current-account-entry.dto';

type PartyType = 'DEALER' | 'CUSTOMER';
@Injectable()
export class CurrentAccountsService {
  constructor(private readonly db: DatabaseService) {}
  private table(partyType: PartyType) { return partyType === 'DEALER' ? 'dealers' : 'customers'; }
  private column(partyType: PartyType) { return partyType === 'DEALER' ? 'dealer_id' : 'customer_id'; }
  private async exists(partyType: PartyType, id: string) {
    const result = await this.db.query(`SELECT 1 FROM ${this.table(partyType)} WHERE id=$1`, [id]);
    if (!result.rowCount) throw new NotFoundException(partyType === 'DEALER' ? 'Bayi bulunamadı' : 'Müşteri bulunamadı');
  }
  async summary() {
    const result = await this.db.query(`
      WITH parties AS (
        SELECT 'DEALER'::current_account_party_type party_type,d.id dealer_id,NULL::uuid customer_id,d.company_name party_name,d.code party_code FROM dealers d
        UNION ALL
        SELECT 'CUSTOMER'::current_account_party_type,NULL::uuid,c.id,COALESCE(NULLIF(trim(concat_ws(' ',c.first_name,c.last_name)),''),c.email),c.email FROM customers c
      ), currencies AS (SELECT unnest(ARRAY['TRY','EUR','USD'])::char(3) currency)
      SELECT p.party_type,p.party_name,p.party_code,p.dealer_id,p.customer_id,cu.currency,
        COALESCE(SUM(CASE WHEN e.direction='DEBIT' THEN e.amount ELSE -e.amount END),0)::text balance,MAX(e.created_at) last_movement_at
      FROM parties p CROSS JOIN currencies cu
      LEFT JOIN current_account_entries e ON e.party_type=p.party_type AND e.currency=cu.currency AND (e.dealer_id=p.dealer_id OR e.customer_id=p.customer_id)
      GROUP BY p.party_type,p.party_name,p.party_code,p.dealer_id,p.customer_id,cu.currency
      ORDER BY last_movement_at DESC NULLS LAST,p.party_name`);
    return result.rows;
  }
  async detail(partyType: PartyType, partyId: string) {
    if (partyType !== 'DEALER' && partyType !== 'CUSTOMER') throw new BadRequestException('Geçersiz cari hesap türü');
    await this.exists(partyType, partyId);
    const column = this.column(partyType);
    const [balances, entries] = await Promise.all([
      this.db.query(`SELECT currency,COALESCE(SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END),0)::text balance FROM current_account_entries WHERE party_type=$1 AND ${column}=$2 GROUP BY currency ORDER BY currency`, [partyType, partyId]),
      this.db.query(`SELECT id,direction,entry_type,amount::text amount,currency,source_type,source_id,description,created_at FROM current_account_entries WHERE party_type=$1 AND ${column}=$2 ORDER BY created_at DESC LIMIT 200`, [partyType, partyId]),
    ]);
    return { partyType, partyId, balances: balances.rows, entries: entries.rows };
  }
  async create(dto: CreateCurrentAccountEntryDto, actor: RequestUser) {
    const partyType = dto.partyType;
    await this.exists(partyType, dto.partyId);
    const fixedDirection: Record<string, 'DEBIT' | 'CREDIT'> = { SALE: 'DEBIT', COLLECTION: 'CREDIT', RETURN: 'CREDIT', COMMISSION_USE: 'CREDIT' };
    const direction = fixedDirection[dto.entryType] ?? dto.direction;
    if (!direction) throw new BadRequestException('Düzeltme için borç veya alacak yönü seçin');
    if (dto.entryType !== 'ADJUSTMENT' && dto.direction && dto.direction !== direction) throw new BadRequestException('Bu hareket türünün yönü değiştirilemez');
    const column = this.column(partyType);
    try {
      const result = await this.db.query<{ id: string }>(`INSERT INTO current_account_entries(party_type,${column},direction,entry_type,amount,currency,source_type,source_id,description,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [partyType, dto.partyId, direction, dto.entryType, dto.amount, dto.currency ?? 'TRY', dto.sourceType.trim(), dto.sourceId ?? null, dto.description.trim(), actor.id]);
      await this.db.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [actor.id, 'current_account.entry.created', 'current_account_entry', result.rows[0].id, JSON.stringify({ partyType, partyId: dto.partyId, entryType: dto.entryType, direction, amount: dto.amount, currency: dto.currency ?? 'TRY' })]);
      return result.rows[0];
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Bu kaynak için aynı cari hareket zaten kaydedilmiş');
      throw error;
    }
  }
}
