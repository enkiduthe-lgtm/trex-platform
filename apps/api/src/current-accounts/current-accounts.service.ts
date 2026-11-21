import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { CreateCurrentAccountEntryDto } from './dto/create-current-account-entry.dto';
import { createHash } from 'node:crypto';
import { cents, formatCents } from '../orders/order-pricing';

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
        COALESCE(SUM(CASE WHEN e.direction='DEBIT' THEN e.amount ELSE -e.amount END),0)::text balance,
        COALESCE(SUM(CASE WHEN e.direction='DEBIT' AND e.due_at<current_date THEN e.amount ELSE 0 END),0)::text overdue_debit,
        MAX(e.created_at) last_movement_at
      FROM parties p CROSS JOIN currencies cu
      LEFT JOIN current_account_entries e ON e.party_type=p.party_type AND e.currency=cu.currency AND (e.dealer_id=p.dealer_id OR e.customer_id=p.customer_id)
      GROUP BY p.party_type,p.party_name,p.party_code,p.dealer_id,p.customer_id,cu.currency
      ORDER BY last_movement_at DESC NULLS LAST,p.party_name`);
    return result.rows;
  }
  async detail(partyType: PartyType, partyId: string,dateFrom?:string,dateTo?:string) {
    if (partyType !== 'DEALER' && partyType !== 'CUSTOMER') throw new BadRequestException('Geçersiz cari hesap türü');
    for(const date of [dateFrom,dateTo])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new BadRequestException('Geçerli Bir Tarih Seçin');
    if(dateFrom&&dateTo&&dateFrom>dateTo)throw new BadRequestException('Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz');
    await this.exists(partyType, partyId);
    const column = this.column(partyType);
    return this.db.transaction(async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const params=[partyType,partyId,dateFrom||null,dateTo||null];
      const balances=await client.query(`SELECT currency,
       COALESCE(SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END),0)::text balance,
       COALESCE(SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END) FILTER(WHERE created_at<COALESCE($3::date::timestamp AT TIME ZONE 'Europe/Istanbul','-infinity'::timestamptz)),0)::text opening_balance,
       COALESCE(SUM(amount) FILTER(WHERE direction='DEBIT' AND created_at>=COALESCE($3::date::timestamp AT TIME ZONE 'Europe/Istanbul','-infinity'::timestamptz) AND created_at<COALESCE(($4::date+1)::timestamp AT TIME ZONE 'Europe/Istanbul','infinity'::timestamptz)),0)::text period_debit,
       COALESCE(SUM(amount) FILTER(WHERE direction='CREDIT' AND created_at>=COALESCE($3::date::timestamp AT TIME ZONE 'Europe/Istanbul','-infinity'::timestamptz) AND created_at<COALESCE(($4::date+1)::timestamp AT TIME ZONE 'Europe/Istanbul','infinity'::timestamptz)),0)::text period_credit,
       COALESCE(SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END) FILTER(WHERE created_at<COALESCE(($4::date+1)::timestamp AT TIME ZONE 'Europe/Istanbul','infinity'::timestamptz)),0)::text closing_balance
       FROM current_account_entries WHERE party_type=$1 AND ${column}=$2 GROUP BY currency ORDER BY currency`,params);
      const entries=await client.query(`WITH history AS (
       SELECT id,direction,entry_type,amount::text amount,currency,source_type,source_id,description,due_at,created_at,
       SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END) OVER(PARTITION BY currency ORDER BY created_at,id ROWS UNBOUNDED PRECEDING)::text running_balance
       FROM current_account_entries WHERE party_type=$1 AND ${column}=$2
      ) SELECT * FROM history WHERE created_at>=COALESCE($3::date::timestamp AT TIME ZONE 'Europe/Istanbul','-infinity'::timestamptz) AND created_at<COALESCE(($4::date+1)::timestamp AT TIME ZONE 'Europe/Istanbul','infinity'::timestamptz) ORDER BY created_at,id`,params);
      return {partyType,partyId,dateFrom:dateFrom||null,dateTo:dateTo||null,balances:balances.rows,entries:entries.rows};
    });
  }
  async create(dto: CreateCurrentAccountEntryDto, actor: RequestUser, key?: string) {
    const partyType = dto.partyType;
    if (!['DEALER','CUSTOMER'].includes(partyType)) throw new BadRequestException('Geçersiz cari hesap türü');
    if (dto.entryType === 'COMMISSION_USE') throw new BadRequestException('Prim kullanımı bayinin kendi panelindeki sipariş ödemesi üzerinden yapılır.');
    if (key !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) throw new BadRequestException('Geçerli cari işlem anahtarı gerekli');
    const amount = cents(dto.amount);
    if (amount < 1n || amount > 999999999999n) throw new BadRequestException('Geçerli cari hareket tutarı girin');
    const sourceType = dto.sourceType.trim(), description = dto.description.trim();
    if (!sourceType || !description) throw new BadRequestException('Belge türü ve açıklama zorunludur');
    const fixedDirection: Record<string, 'DEBIT' | 'CREDIT'> = { SALE: 'DEBIT', COLLECTION: 'CREDIT', RETURN: 'CREDIT', COMMISSION_USE: 'CREDIT' };
    const direction = fixedDirection[dto.entryType] ?? dto.direction;
    if (!direction) throw new BadRequestException('Düzeltme için borç veya alacak yönü seçin');
    if (dto.entryType !== 'ADJUSTMENT' && dto.direction && dto.direction !== direction) throw new BadRequestException('Bu hareket türünün yönü değiştirilemez');
    const column = this.column(partyType);
    const dueAt = dto.entryType === 'SALE' ? dto.dueAt ?? null : null;
    const identity = key ? `current-account:${actor.id}:${key.toLowerCase()}` : null;
    const hash = identity ? createHash('sha256').update(JSON.stringify({partyType,partyId:dto.partyId.toLowerCase(),entryType:dto.entryType,direction,amount:amount.toString(),currency:dto.currency??'TRY',sourceType,sourceId:dto.sourceId?.toLowerCase()??null,description,dueAt})).digest('hex') : null;
    try {
      return await this.db.transaction(async client => {
        if (identity) {
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[identity]);
          const prior = await client.query<{request_hash:string;resource_id:string}>("SELECT request_hash,resource_id FROM idempotency_records WHERE key=$1 AND resource_type='current_account_entry'",[identity]);
          if (prior.rows[0]) {
            if (prior.rows[0].request_hash !== hash) throw new ConflictException('Bu işlem anahtarı farklı cari harekette kullanılmış');
            const saved = await client.query<{id:string}>('SELECT id FROM current_account_entries WHERE id=$1',[prior.rows[0].resource_id]);
            if (!saved.rows[0]) throw new ConflictException('Önceki cari hareket bulunamadı. Yeni kayıt oluşturmadan önce geçmişi kontrol edin.');
            return {...saved.rows[0],replayed:true};
          }
        }
        const party = await client.query(`SELECT 1 FROM ${this.table(partyType)} WHERE id=$1 FOR KEY SHARE`,[dto.partyId]);
        if (!party.rowCount) throw new NotFoundException(partyType === 'DEALER' ? 'Bayi bulunamadı' : 'Müşteri bulunamadı');
        const result = await client.query<{ id: string }>(`INSERT INTO current_account_entries(party_type,${column},direction,entry_type,amount,currency,source_type,source_id,description,due_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [partyType, dto.partyId, direction, dto.entryType, formatCents(amount), dto.currency ?? 'TRY', sourceType, dto.sourceId ?? null, description, dueAt, actor.id]);
        await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [actor.id, 'current_account.entry.created', 'current_account_entry', result.rows[0].id, JSON.stringify({ partyType, partyId: dto.partyId, entryType: dto.entryType, direction, amount: dto.amount, currency: dto.currency ?? 'TRY', dueAt })]);
        if (identity) await client.query("INSERT INTO idempotency_records(key,request_hash,resource_type,resource_id,expires_at) VALUES($1,$2,'current_account_entry',$3,now()+interval '365 days')",[identity,hash,result.rows[0].id]);
        return result.rows[0];
      });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Bu kaynak için aynı cari hareket zaten kaydedilmiş');
      throw error;
    }
  }
}
