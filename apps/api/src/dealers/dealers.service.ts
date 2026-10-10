import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { CreateDealerLevelDto } from './dto/create-dealer-level.dto';
import { DealerStatus } from './dto/update-dealer-status.dto';
import { PublicDealerApplicationDto } from './dto/public-dealer-application.dto';
import { CreateDealerBankAccountDto, CreateDealerLedgerEntryDto, CreateDealerPriceGroupDto } from './dto/dealer-commercial.dto';
import { randomUUID } from 'crypto';
@Injectable()
export class DealersService {
  constructor(private readonly db: DatabaseService) {}
  private async audit(actor: RequestUser, action: string, entityId: string) {
    await this.db.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [actor.id, action, 'dealer', entityId]);
  }
  async create(dto: CreateDealerDto, actor: RequestUser) {
    if (dto.parentDealerId) await this.assertActiveParent(dto.parentDealerId);
    try {
      const dealer = await this.db.query<{ id: string }>("INSERT INTO dealers (code,company_name,tax_number,parent_dealer_id,dealer_level_id,status) VALUES ($1,$2,$3,$4,$5,'RECEIVED') RETURNING id", [dto.code, dto.companyName, dto.taxNumber ?? null, dto.parentDealerId ?? null, dto.dealerLevelId ?? null]);
      await this.db.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [actor.id, 'dealer.created', 'dealer', dealer.rows[0].id]); return dealer.rows[0];
    } catch (error: unknown) { if ((error as { code?: string }).code === '23505') throw new ConflictException('Dealer code already exists'); throw error; }
  }
  async createPublicApplication(dto: PublicDealerApplicationDto) {
    const code = `APP-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    const result = await this.db.query<{ id: string }>(`INSERT INTO dealers(code,company_name,status,contact_name,contact_email,contact_phone,city,region,sales_channels,social_media) VALUES ($1,$2,'RECEIVED',$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [code, dto.companyName.trim(), dto.contactName.trim(), dto.email.trim().toLowerCase(), dto.phone.trim(), dto.city.trim(), dto.region?.trim() || null, dto.salesChannels?.trim() || null, dto.socialMedia?.trim() || null]);
    return { applicationId: result.rows[0].id, status: 'RECEIVED' };
  }
  async list() { return (await this.db.query('SELECT d.id,d.code,d.company_name,d.tax_number,d.status,d.dealer_level_id,d.parent_dealer_id,d.price_group_id,d.created_at,l.name AS dealer_level_name,p.company_name AS parent_dealer_name,g.name AS price_group_name FROM dealers d LEFT JOIN dealer_levels l ON l.id=d.dealer_level_id LEFT JOIN dealers p ON p.id=d.parent_dealer_id LEFT JOIN dealer_price_groups g ON g.id=d.price_group_id ORDER BY d.created_at DESC')).rows; }
  async listLevels() { return (await this.db.query('SELECT id,code,name,sort_order,is_active FROM dealer_levels ORDER BY sort_order')).rows; }
  async createLevel(dto: CreateDealerLevelDto, actor: RequestUser) {
    const count = await this.db.query<{ count: string }>('SELECT count(*)::text AS count FROM dealer_levels');
    if (Number(count.rows[0].count) >= 4) throw new ConflictException('A maximum of four dealer levels can be configured');
    try { const created = await this.db.query<{ id: string }>('INSERT INTO dealer_levels(code,name,sort_order) VALUES ($1,$2,$3) RETURNING id', [dto.code.trim(), dto.name.trim(), dto.sortOrder]); await this.audit(actor, 'dealer_level.created', created.rows[0].id); return created.rows[0]; }
    catch (error: unknown) { if ((error as { code?: string }).code === '23505') throw new ConflictException('Dealer level code and order must be unique'); throw error; }
  }
  async updateStatus(dealerId: string, status: DealerStatus, actor: RequestUser) {
    const updated = await this.db.query<{ id: string; status: string }>('UPDATE dealers SET status=$1,updated_at=now() WHERE id=$2 RETURNING id,status', [status, dealerId]);
    if (!updated.rowCount) throw new NotFoundException('Dealer not found');
    await this.audit(actor, `dealer.status.${status.toLowerCase()}`, dealerId); return updated.rows[0];
  }
  private async assertActiveParent(id: string) { const parent = await this.db.query("SELECT 1 FROM dealers WHERE id=$1 AND status='ACTIVE'", [id]); if (!parent.rowCount) throw new NotFoundException('Active parent dealer not found'); }
  async setParent(dealerId: string, parentDealerId: string, actor: RequestUser) {
    if (dealerId === parentDealerId) throw new ConflictException('Dealer cannot be its own parent');
    await this.assertActiveParent(parentDealerId);
    const cycle = await this.db.query(`WITH RECURSIVE ancestors AS (SELECT id,parent_dealer_id FROM dealers WHERE id=$1 UNION ALL SELECT d.id,d.parent_dealer_id FROM dealers d JOIN ancestors a ON d.id=a.parent_dealer_id) SELECT 1 FROM ancestors WHERE id=$2`, [parentDealerId, dealerId]);
    if (cycle.rowCount) throw new ConflictException('A descendant cannot become the parent');
    const updated = await this.db.query('UPDATE dealers SET parent_dealer_id=$1,updated_at=now() WHERE id=$2 RETURNING id', [parentDealerId, dealerId]); if (!updated.rowCount) throw new NotFoundException('Dealer not found');
    await this.db.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [actor.id, 'dealer.parent_changed', 'dealer', dealerId]); return updated.rows[0];
  }
  async listPriceGroups() { return (await this.db.query('SELECT id,code,name,description,is_active,created_at FROM dealer_price_groups ORDER BY name')).rows; }
  async createPriceGroup(dto: CreateDealerPriceGroupDto, actor: RequestUser) {
    try { const result=await this.db.query<{id:string}>('INSERT INTO dealer_price_groups(code,name,description) VALUES ($1,$2,$3) RETURNING id',[dto.code.trim(),dto.name.trim(),dto.description?.trim()||null]); await this.audit(actor,'dealer_price_group.created',result.rows[0].id); return result.rows[0]; }
    catch(error:unknown) { if((error as {code?:string}).code==='23505') throw new ConflictException('Bu fiyat grubu kodu zaten kullanılıyor'); throw error; }
  }
  async setPriceGroup(dealerId:string, priceGroupId:string|null|undefined, actor:RequestUser) {
    if(priceGroupId) { const group=await this.db.query('SELECT 1 FROM dealer_price_groups WHERE id=$1 AND is_active=true',[priceGroupId]); if(!group.rowCount) throw new NotFoundException('Aktif fiyat grubu bulunamadı'); }
    const updated=await this.db.query<{id:string}>('UPDATE dealers SET price_group_id=$1,updated_at=now() WHERE id=$2 RETURNING id',[priceGroupId??null,dealerId]); if(!updated.rowCount) throw new NotFoundException('Dealer not found'); await this.audit(actor,'dealer.price_group_changed',dealerId); return updated.rows[0];
  }
  async commercialSummary(dealerId:string) {
    const dealer=await this.db.query('SELECT d.id,d.code,d.company_name,d.status,d.price_group_id,g.name AS price_group_name FROM dealers d LEFT JOIN dealer_price_groups g ON g.id=d.price_group_id WHERE d.id=$1',[dealerId]); if(!dealer.rowCount) throw new NotFoundException('Dealer not found');
    const [banks,ledger]=await Promise.all([this.db.query('SELECT id,account_holder,iban,is_verified,is_primary,created_at FROM dealer_bank_accounts WHERE dealer_id=$1 ORDER BY is_primary DESC,created_at DESC',[dealerId]),this.db.query(`SELECT currency,COALESCE(SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END),0)::text balance FROM dealer_ledger_entries WHERE dealer_id=$1 GROUP BY currency ORDER BY currency`,[dealerId])]);
    return {...dealer.rows[0],bankAccounts:banks.rows,balances:ledger.rows};
  }
  async addBankAccount(dealerId:string,dto:CreateDealerBankAccountDto,actor:RequestUser) { return this.db.transaction(async client=>{ const dealer=await client.query('SELECT 1 FROM dealers WHERE id=$1 FOR UPDATE',[dealerId]); if(!dealer.rowCount) throw new NotFoundException('Dealer not found'); const iban=dto.iban.replace(/\s/g,'').toUpperCase(); if(dto.isPrimary) await client.query('UPDATE dealer_bank_accounts SET is_primary=false WHERE dealer_id=$1',[dealerId]); const row=await client.query<{id:string}>('INSERT INTO dealer_bank_accounts(dealer_id,account_holder,iban,is_primary) VALUES ($1,$2,$3,$4) RETURNING id',[dealerId,dto.accountHolder.trim(),iban,Boolean(dto.isPrimary)]); await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[actor.id,'dealer.bank_account.added','dealer_bank_account',row.rows[0].id]); return row.rows[0]; }); }
  async addLedgerEntry(dealerId:string,dto:CreateDealerLedgerEntryDto,actor:RequestUser) { const dealer=await this.db.query('SELECT 1 FROM dealers WHERE id=$1',[dealerId]); if(!dealer.rowCount) throw new NotFoundException('Dealer not found'); const row=await this.db.query<{id:string}>('INSERT INTO dealer_ledger_entries(dealer_id,direction,amount,currency,reference_type,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[dealerId,dto.direction,dto.amount,dto.currency??'TRY',dto.referenceType.trim(),dto.description.trim(),actor.id]); await this.audit(actor,'dealer.ledger.created',dealerId); return row.rows[0]; }
}
