import { reportPeriod } from '../orders/report-period';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
  async detail(id:string) {
    const dealer=await this.db.query(`SELECT d.id,d.code,d.company_name,d.status,d.contact_name,d.contact_email,d.contact_phone,d.city,d.region,d.company_address,d.tax_number,d.tax_office,d.monthly_sales_target,d.created_at,l.name AS dealer_level_name FROM dealers d LEFT JOIN dealer_levels l ON l.id=d.dealer_level_id WHERE d.id=$1`,[id]);
    if(!dealer.rowCount)throw new NotFoundException('Bayi Bulunamadı');
    const source=this.dealerOrderSource();
    const [orders,returns,commissions,requests,deductions,spends,commercial]=await Promise.all([
      this.db.query(`${source} SELECT o.id,o.order_number,o.status,o.total_amount,o.currency,o.created_at FROM dealer_orders d JOIN orders o ON o.id=d.entity_id WHERE d.dealer_id=$1 ORDER BY o.created_at DESC,o.id`,[id]),
      this.db.query(`${source} SELECT r.id,r.status,r.reason,r.requested_at,r.completed_at,o.id AS order_id,o.order_number FROM dealer_orders d JOIN orders o ON o.id=d.entity_id JOIN returns r ON r.order_id=o.id WHERE d.dealer_id=$1 ORDER BY r.requested_at DESC,r.id`,[id]),
      this.db.query(`SELECT e.id,e.amount,e.currency,e.status,e.entry_kind,e.created_at,e.paid_at,e.reversed_at,e.note,o.id AS order_id,o.order_number,oi.product_name,oi.quantity FROM commission_entries e JOIN orders o ON o.id=e.order_id JOIN order_items oi ON oi.id=e.order_item_id WHERE e.dealer_id=$1 AND e.recipient_user_id IS NULL ORDER BY e.created_at DESC,e.id`,[id]),
      this.db.query('SELECT id,amount,currency,status,due_date,created_at,paid_at,reference_number,note FROM dealer_prim_requests WHERE dealer_id=$1 ORDER BY created_at DESC,id',[id]),
      this.db.query('SELECT f.id,f.amount,f.currency,f.note,f.created_at,o.id AS order_id,o.order_number FROM dealer_prim_deductions f JOIN returns r ON r.id=f.return_id JOIN orders o ON o.id=r.order_id WHERE f.dealer_id=$1 ORDER BY f.created_at DESC,f.id',[id]),
      this.db.query(`SELECT s.id,s.amount,'TRY' AS currency,s.created_at,o.id AS order_id,o.order_number,'SPEND' AS kind FROM dealer_commission_spends s JOIN orders o ON o.id=s.order_id WHERE s.dealer_id=$1 UNION ALL SELECT f.id,f.amount,'TRY',f.created_at,o.id,o.order_number,'REFUND' FROM dealer_prim_refunds f JOIN orders o ON o.id=f.order_id WHERE f.dealer_id=$1 ORDER BY created_at DESC,id`,[id]),
      this.commercialSummary(id),
    ]);
    return {dealer:dealer.rows[0],orders:orders.rows,returns:returns.rows,commissions:commissions.rows,requests:requests.rows,deductions:deductions.rows,spends:spends.rows,commercial};
  }
  private dealerOrderSource() {
    const uuid='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    return `WITH dealer_orders AS(SELECT DISTINCT ON(entity_id) entity_id,CASE WHEN metadata->>'dealerId' ~* '${uuid}' THEN (metadata->>'dealerId')::uuid END dealer_id,CASE WHEN metadata->>'dealerLevelId' ~* '${uuid}' THEN (metadata->>'dealerLevelId')::uuid END level_id FROM audit_logs WHERE entity_type='order' AND action='order.dealer.created' ORDER BY entity_id,created_at,id)`;
  }
  async salesReport(days=30) {
    const period=reportPeriod(days),args=[period.dateFrom,period.dateTo],where="o.created_at>=($1::date::timestamp AT TIME ZONE 'Europe/Istanbul') AND o.created_at<(($2::date+1)::timestamp AT TIME ZONE 'Europe/Istanbul')";
    const [totals,rows]=await Promise.all([
      this.db.query<{currency:string;order_count:number;revenue:string}>(`${this.dealerOrderSource()} SELECT o.currency,count(*)::int order_count,COALESCE(SUM(o.total_amount) FILTER(WHERE o.status<>'CANCELLED'),0)::text revenue FROM orders o JOIN dealer_orders a ON a.entity_id=o.id JOIN dealers d ON d.id=a.dealer_id WHERE ${where} GROUP BY o.currency ORDER BY o.currency`,args),
      this.db.query(`${this.dealerOrderSource()} SELECT d.id,d.code,d.company_name,a.level_id AS dealer_level_id,l.name AS dealer_level_name,o.currency,count(*)::int order_count,COALESCE(SUM(o.total_amount) FILTER(WHERE o.status<>'CANCELLED'),0)::text revenue,COALESCE(AVG(o.total_amount) FILTER(WHERE o.status<>'CANCELLED'),0)::text average_order,COALESCE(SUM(oi.quantity) FILTER(WHERE o.status<>'CANCELLED'),0)::int item_count FROM dealer_orders a JOIN orders o ON o.id=a.entity_id JOIN dealers d ON d.id=a.dealer_id LEFT JOIN dealer_levels l ON l.id=a.level_id LEFT JOIN LATERAL(SELECT SUM(quantity) AS quantity FROM order_items WHERE order_id=o.id) oi ON true WHERE ${where} GROUP BY d.id,a.level_id,l.name,o.currency ORDER BY COALESCE(SUM(o.total_amount) FILTER(WHERE o.status<>'CANCELLED'),0) DESC,d.company_name`,args)
    ]);
    return {...period,totals:totals.rows.find(row=>row.currency.trim()==='TRY')??{currency:'TRY',order_count:0,revenue:'0'},totalsByCurrency:totals.rows,dealers:rows.rows};
  }
  async salesReportDetail(dateFrom?:string,dateTo?:string,dealerId?:string,product?:string,status?:string) {
    const period=reportPeriod(30,dateFrom,dateTo);
    if(dealerId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealerId))throw new BadRequestException('Geçerli Bir Bayi Seçin.');
    if(status&&!['PENDING_PAYMENT','PAID','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED'].includes(status))throw new BadRequestException('Geçerli Bir Sipariş Durumu Seçin.');
    const search=product?.trim().replace(/[\\%_]/g,'\\$&')||null;
    return (await this.db.query(`${this.dealerOrderSource()} SELECT d.id AS dealer_id,d.code AS dealer_code,d.company_name,a.level_id AS dealer_level_id,l.name AS dealer_level_name,o.id AS order_id,o.order_number,o.created_at,o.status,o.total_amount,o.currency,
      oi.id AS item_id,oi.product_name,oi.sku,oi.quantity,oi.unit_amount,(oi.quantity*oi.unit_amount)::text AS line_total,COALESCE(payment.status::text,'') AS payment_status
      FROM dealer_orders a JOIN orders o ON o.id=a.entity_id JOIN dealers d ON d.id=a.dealer_id JOIN order_items oi ON oi.order_id=o.id LEFT JOIN dealer_levels l ON l.id=a.level_id
      LEFT JOIN LATERAL(SELECT status FROM payments WHERE checkout_id=o.checkout_id ORDER BY created_at DESC,id DESC LIMIT 1) payment ON true
      WHERE o.created_at>=($1::date::timestamp AT TIME ZONE 'Europe/Istanbul') AND o.created_at<(($2::date+1)::timestamp AT TIME ZONE 'Europe/Istanbul')
        AND ($3::uuid IS NULL OR d.id=$3::uuid) AND ($4::text IS NULL OR oi.product_name ILIKE '%'||$4||'%' OR oi.sku ILIKE '%'||$4||'%') AND ($5::text IS NULL OR o.status::text=$5)
      ORDER BY o.created_at DESC,o.id,oi.id`,[period.dateFrom,period.dateTo,dealerId||null,search,status||null])).rows;
  }
  async listLevels() { return (await this.db.query('SELECT id,code,name,sort_order,is_active FROM dealer_levels WHERE is_active=true ORDER BY sort_order')).rows; }
  async createLevel(dto: CreateDealerLevelDto, actor: RequestUser) {
    try { return await this.db.transaction(async client=>{await client.query("SELECT pg_advisory_xact_lock(hashtext('dealer-level-count'))");const count=await client.query<{count:string}>('SELECT count(*)::text AS count FROM dealer_levels WHERE is_active=true');if(Number(count.rows[0].count)>=3)throw new ConflictException('En Fazla Üç Aktif Bayi Seviyesi Tanımlanabilir');const created=await client.query<{id:string}>('INSERT INTO dealer_levels(code,name,sort_order) VALUES($1,$2,$3) RETURNING id',[dto.code.trim(),dto.name.trim(),dto.sortOrder]);await client.query("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,'dealer_level.created','dealer',$2)",[actor.id,created.rows[0].id]);return created.rows[0];}); }
    catch (error: unknown) { if ((error as { code?: string }).code === '23505') throw new ConflictException('Dealer level code and order must be unique'); throw error; }
  }
  async updateLevel(levelId:string,name:string,actor:RequestUser) { const result=await this.db.query<{id:string}>('UPDATE dealer_levels SET name=$1 WHERE id=$2 RETURNING id',[name.trim(),levelId]); if(!result.rowCount) throw new NotFoundException('Bayi seviyesi bulunamadı'); await this.audit(actor,'dealer_level.updated',levelId); return result.rows[0]; }
  async setLevel(dealerId:string,levelId:string|null|undefined,actor:RequestUser) { if(levelId) { const level=await this.db.query('SELECT 1 FROM dealer_levels WHERE id=$1 AND is_active=true',[levelId]); if(!level.rowCount) throw new NotFoundException('Aktif bayi seviyesi bulunamadı'); } const result=await this.db.query<{id:string}>('UPDATE dealers SET dealer_level_id=$1,price_group_id=NULL,updated_at=now() WHERE id=$2 RETURNING id',[levelId??null,dealerId]); if(!result.rowCount) throw new NotFoundException('Bayi bulunamadı'); await this.audit(actor,'dealer.level_changed',dealerId); return result.rows[0]; }
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
