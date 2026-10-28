import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { CreateDealerLevelDto } from './dto/create-dealer-level.dto';
import { DealerStatus } from './dto/update-dealer-status.dto';
import { PublicDealerApplicationDto } from './dto/public-dealer-application.dto';
import { CreateDealerBankAccountDto, CreateDealerLedgerEntryDto, CreateDealerPriceGroupDto } from './dto/dealer-commercial.dto';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationChannel } from '../notifications/dto/create-notification.dto';
@Injectable()
export class DealersService {
  constructor(private readonly db: DatabaseService, private readonly notifications: NotificationsService) {}
  private async email(recipient: string, subject: string, body: string) { await this.notifications.send({ channel: NotificationChannel.EMAIL, recipient, subject, body }).catch(() => undefined); }
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
    if (dto.password.length < 12) throw new ConflictException('Şifre en az 12 karakter olmalıdır');
    const code = `APP-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    const email = dto.email.trim().toLowerCase();
    const iban = dto.iban?.replace(/\s/g, '').toUpperCase() || null;    const accountHolder = dto.accountHolder?.trim() || null;    const companyName = dto.companyName?.trim() || `Bireysel bayi · ${dto.contactName.trim()}`;
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    try {
      const application = await this.db.transaction(async client => {
        const result = await client.query<{ id: string }>(`INSERT INTO dealers(code,company_name,tax_number,status,contact_name,authorized_full_name,contact_email,contact_phone,city,region,company_address,tax_office,monthly_sales_target,sales_channels,social_media) VALUES ($1,$2,$3,'RECEIVED',$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [code, companyName, dto.taxNumber?.trim() || null, dto.contactName.trim(), email, dto.phone.trim(), dto.city.trim(), dto.district.trim() || dto.region?.trim() || null, dto.address.trim(), dto.taxOffice?.trim() || null, dto.monthlySalesTarget, dto.salesChannels?.trim() || null, dto.socialMedia?.trim() || null]);
        const dealerId = result.rows[0].id;
        if (iban && accountHolder) await client.query('INSERT INTO dealer_bank_accounts(dealer_id,account_holder,iban,is_primary) VALUES($1,$2,$3,true)', [dealerId, accountHolder, iban]);
        const user = await client.query<{ id: string }>("INSERT INTO users(email,password_hash,role,is_active) VALUES($1,$2,'DEALER',false) RETURNING id", [email, passwordHash]);
        await client.query('INSERT INTO dealer_user_accounts(dealer_id,user_id) VALUES($1,$2)', [dealerId, user.rows[0].id]);
        return { applicationId: dealerId, status: 'RECEIVED' };
      });
      await this.email(email, 'TREX Tea bayi başvurunuz alındı', 'Başvurunuz alındı. Yönetici onayı sonrasında seçtiğiniz e-posta ve şifreyle giriş yapabilirsiniz.');
      const admins = await this.db.query<{ email: string }>("SELECT email FROM users WHERE role='SUPER_ADMIN' AND is_active=true");
      await Promise.all(admins.rows.map(admin => this.email(admin.email, 'Yeni bayi başvurusu', `${companyName} adlı firmadan bayi başvurusu geldi.`)));
      return application;
    } catch (error: unknown) { if ((error as { code?: string }).code === '23505') throw new ConflictException('Bu e-posta, IBAN veya bayi kaydı zaten kullanılıyor'); throw error; }
  }
  async list() { return (await this.db.query('SELECT d.id,d.code,d.company_name,d.tax_number,d.status,d.dealer_level_id,d.parent_dealer_id,d.price_group_id,d.created_at,d.contact_name,d.contact_email,d.contact_phone,d.city,d.region,d.company_address,d.monthly_sales_target,l.name AS dealer_level_name,p.company_name AS parent_dealer_name,g.name AS price_group_name FROM dealers d LEFT JOIN dealer_levels l ON l.id=d.dealer_level_id LEFT JOIN dealers p ON p.id=d.parent_dealer_id LEFT JOIN dealer_price_groups g ON g.id=d.price_group_id ORDER BY d.created_at DESC')).rows; }
  async listLevels() { return (await this.db.query('SELECT id,code,name,sort_order,is_active FROM dealer_levels ORDER BY sort_order')).rows; }
  async createLevel(dto: CreateDealerLevelDto, actor: RequestUser) {
    const count = await this.db.query<{ count: string }>('SELECT count(*)::text AS count FROM dealer_levels');
    if (Number(count.rows[0].count) >= 4) throw new ConflictException('A maximum of four dealer levels can be configured');
    try { const created = await this.db.query<{ id: string }>('INSERT INTO dealer_levels(code,name,sort_order) VALUES ($1,$2,$3) RETURNING id', [dto.code.trim(), dto.name.trim(), dto.sortOrder]); await this.audit(actor, 'dealer_level.created', created.rows[0].id); return created.rows[0]; }
    catch (error: unknown) { if ((error as { code?: string }).code === '23505') throw new ConflictException('Dealer level code and order must be unique'); throw error; }
  }
  async updateLevel(levelId:string,name:string,actor:RequestUser) { const result=await this.db.query<{id:string}>('UPDATE dealer_levels SET name=$1 WHERE id=$2 RETURNING id',[name.trim(),levelId]); if(!result.rowCount) throw new NotFoundException('Bayi seviyesi bulunamadı'); await this.audit(actor,'dealer_level.updated',levelId); return result.rows[0]; }
  async setLevel(dealerId:string,levelId:string|null|undefined,actor:RequestUser) { if(levelId) { const level=await this.db.query('SELECT 1 FROM dealer_levels WHERE id=$1 AND is_active=true',[levelId]); if(!level.rowCount) throw new NotFoundException('Aktif bayi seviyesi bulunamadı'); } const result=await this.db.query<{id:string}>('UPDATE dealers SET dealer_level_id=$1,updated_at=now() WHERE id=$2 RETURNING id',[levelId??null,dealerId]); if(!result.rowCount) throw new NotFoundException('Bayi bulunamadı'); await this.audit(actor,'dealer.level_changed',dealerId); return result.rows[0]; }
  async updateStatus(dealerId: string, status: DealerStatus, actor: RequestUser) {
    const changed = await this.db.transaction(async client => {
      if (status === 'ACTIVE') {
        
        // IBAN bilgisi isteğe bağlıdır; bayi onayı ve sipariş için engel olmaz.
      }
      const updated = await client.query<{ id: string; status: string }>('UPDATE dealers SET status=$1,updated_at=now() WHERE id=$2 RETURNING id,status', [status, dealerId]);
      if (!updated.rowCount) throw new NotFoundException('Dealer not found');
      if (status === 'ACTIVE') await client.query("UPDATE users SET is_active=true,updated_at=now() WHERE id IN (SELECT user_id FROM dealer_user_accounts WHERE dealer_id=$1)", [dealerId]);
      if (status === 'SUSPENDED' || status === 'REJECTED') await client.query("UPDATE users SET is_active=false,updated_at=now() WHERE id IN (SELECT user_id FROM dealer_user_accounts WHERE dealer_id=$1)", [dealerId]);
      await client.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [actor.id, `dealer.status.${status.toLowerCase()}`, 'dealer', dealerId]);
      return updated.rows[0];
    });
    if (status === 'ACTIVE' || status === 'REJECTED') {
      const recipient = await this.db.query<{ contact_email: string | null }>('SELECT contact_email FROM dealers WHERE id=$1', [dealerId]);
      if (recipient.rows[0]?.contact_email) await this.email(recipient.rows[0].contact_email, status === 'ACTIVE' ? 'TREX Tea bayi başvurunuz onaylandı' : 'TREX Tea bayi başvurunuz sonuçlandı', status === 'ACTIVE' ? 'Başvurunuz onaylandı. Seçtiğiniz e-posta ve şifreyle giriş yapabilir, sözleşmeyi onayladıktan sonra sipariş verebilirsiniz.' : 'Bayi başvurunuz şu an için onaylanmadı. Bilgi için TREX Tea ekibiyle iletişime geçebilirsiniz.');
    }
    return changed;
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
