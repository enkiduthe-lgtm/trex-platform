import { BadRequestException, Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { CreateFinanceRecordDto } from './dto/create-finance-record.dto';
import { CreateFinanceAccountDto } from './dto/create-finance-account.dto';
import { CreateFinanceTransactionDto, CreateFinanceTransferDto } from './dto/create-finance-transaction.dto';
import { ApproveCollectionDto } from './dto/approve-collection.dto';
import { CreateMarketplaceSettlementDto } from './dto/create-marketplace-settlement.dto';
import { CreateFinanceBudgetDto } from './dto/create-finance-budget.dto';
import { CreateCarrierSettlementDto } from './dto/create-carrier-settlement.dto';
import { StaffChannelService } from '../commissions/staff-channel.service';
import { pendingCollection, realizedCash, visibleFinanceMovement } from './finance-cash-sql';
import { manualPaymentProviders, reportOrderStatus } from '../orders/report-order-status';
import { cents } from '../orders/order-pricing';
@Injectable()
export class FinanceService {
  constructor(private readonly db: DatabaseService) {}
  async paytrCash() {
    const [settings,receipts]=await Promise.all([
      this.db.query('SELECT commission_rate FROM paytr_finance_settings WHERE singleton=true'),
      this.db.query('SELECT r.*,o.order_number FROM paytr_receipts r JOIN orders o ON o.id=r.order_id ORDER BY r.created_at DESC LIMIT 100'),
    ]);
    return {commissionRate:settings.rows[0].commission_rate,receipts:receipts.rows};
  }
  async updatePaytrRate(rate:number,actor:RequestUser) {
    return this.db.transaction(async client=>{
      const previous=await client.query('SELECT commission_rate FROM paytr_finance_settings WHERE singleton=true FOR UPDATE');
      await client.query('UPDATE paytr_finance_settings SET commission_rate=$1 WHERE singleton=true',[rate]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,metadata) VALUES ($1,$2,$3,$4)',[actor.id,'finance.paytr.rate.updated','paytr_finance_settings',JSON.stringify({previous:previous.rows[0].commission_rate,current:rate})]);
      return {commissionRate:rate};
    });
  }
  async list() { return (await this.db.query('SELECT r.*,u.email AS created_by_email FROM admin_finance_records r JOIN users u ON u.id=r.created_by ORDER BY r.occurred_at DESC, r.created_at DESC')).rows; }
  async create(dto: CreateFinanceRecordDto, actor: RequestUser) {
    const result = await this.db.query<{ id: string }>('INSERT INTO admin_finance_records(kind,amount,occurred_at,counterparty_name,bank_name,reference_number,description,created_by) VALUES ($1,$2,COALESCE($3::timestamptz,now()),$4,$5,$6,$7,$8) RETURNING id', [dto.kind, dto.amount, dto.occurredAt ?? null, dto.counterpartyName?.trim() || null, dto.bankName?.trim() || null, dto.referenceNumber?.trim() || null, dto.description.trim(), actor.id]);
    await this.db.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [actor.id, `finance.${dto.kind.toLowerCase()}.created`, 'admin_finance_record', result.rows[0].id]);
    return result.rows[0];
  }
  async listAccounts(actor?:RequestUser) {
    const canSeeAll=actor?(await new StaffChannelService(this.db).access(actor)).canSeeAll:true;
    return (await this.db.query(`SELECT a.*, COALESCE(SUM(CASE WHEN t.kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') THEN -t.amount ELSE t.amount END),0) AS balance
      FROM finance_accounts a LEFT JOIN finance_transactions t ON t.account_id=a.id AND ${realizedCash}
        AND ${visibleFinanceMovement(1,2)}
      GROUP BY a.id ORDER BY a.created_at DESC`,[canSeeAll,actor?.id??null])).rows;
  }
  async createAccount(dto: CreateFinanceAccountDto, actor: RequestUser) {
    return this.db.transaction(async client => {
      const result = await client.query<{ id: string }>('INSERT INTO finance_accounts(name,account_type,created_by,currency) VALUES ($1,$2,$3,$4) RETURNING id', [dto.name.trim(), dto.accountType, actor.id, dto.currency ?? 'TRY']);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [actor.id, 'finance.account.created', 'finance_account', result.rows[0].id, JSON.stringify({ name: dto.name.trim(), accountType: dto.accountType, currency: dto.currency ?? 'TRY' })]);
      return result.rows[0];
    });
  }
  async updateAccount(id:string,dto:CreateFinanceAccountDto,actor:RequestUser) {
    return this.db.transaction(async client=>{
      const previous=await client.query('SELECT id,name,account_type,currency FROM finance_accounts WHERE id=$1 FOR UPDATE',[id]);
      if(!previous.rowCount) throw new BadRequestException('Para hesabı bulunamadı');
        const requestedCurrency=dto.currency??'TRY';
        if(previous.rows[0].currency!==requestedCurrency) {
          const usage=await client.query('SELECT 1 FROM finance_transactions WHERE account_id=$1 LIMIT 1',[id]);
          if(usage.rowCount) throw new BadRequestException('Hareketi olan hesabın para birimi değiştirilemez');
        }
        await client.query('UPDATE finance_accounts SET name=$1,account_type=$2,currency=$3 WHERE id=$4',[dto.name.trim(),dto.accountType,requestedCurrency,id]);
        await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[actor.id,'finance.account.updated','finance_account',id,JSON.stringify({previous:previous.rows[0],current:{name:dto.name.trim(),accountType:dto.accountType,currency:requestedCurrency}})]);
      return {id};
    });
  }
  async archiveAccount(id:string,actor:RequestUser) {
    return this.db.transaction(async client=>{
      const account=await client.query('SELECT id,name FROM finance_accounts WHERE id=$1 FOR UPDATE',[id]);
      if(!account.rowCount) throw new BadRequestException('Para hesabı bulunamadı');
      await client.query('UPDATE finance_accounts SET is_active=false WHERE id=$1',[id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[actor.id,'finance.account.archived','finance_account',id,JSON.stringify({name:account.rows[0].name})]);
      return {id,archived:true};
    });
  }
  async listTransactions(actor?:RequestUser) {
    const canSeeAll=actor?(await new StaffChannelService(this.db).access(actor)).canSeeAll:true;
    return (await this.db.query(`SELECT t.*, a.name AS account_name, a.currency, o.order_number, u.email AS approved_by_email FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN users u ON u.id=t.approved_by WHERE $1::boolean OR NOT EXISTS(SELECT 1 FROM commission_entries e WHERE e.finance_transaction_id=t.id AND e.staff_role='DIRECTOR' AND e.recipient_user_id<>$2::uuid) ORDER BY t.occurred_at DESC, t.created_at DESC, t.id`,[canSeeAll,actor?.id??null])).rows;
  }
  async reconciliation(dateFrom?:string,dateTo?:string,actor?:RequestUser) {
    const canSeeAll=actor?(await new StaffChannelService(this.db).access(actor)).canSeeAll:true;
    const period = `t.occurred_at>=COALESCE($1::date::timestamp AT TIME ZONE 'Europe/Istanbul','-infinity'::timestamptz)
      AND t.occurred_at<COALESCE(($2::date+1)::timestamp AT TIME ZONE 'Europe/Istanbul','infinity'::timestamptz)`;
    const [accounts,unmatched]=await Promise.all([
      this.db.query(`SELECT a.id,a.name,a.account_type,a.currency,
        COALESCE(SUM(t.amount) FILTER (WHERE t.kind IN ('INCOME','COLLECTION','TRANSFER_IN') AND ${period}),0)::text income,
        COALESCE(SUM(t.amount) FILTER (WHERE t.kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') AND ${period}),0)::text expense,
        COALESCE(SUM(CASE WHEN t.kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') THEN -t.amount ELSE t.amount END),0)::text current_balance,
        count(t.id) FILTER (WHERE ${period})::int movement_count
        FROM finance_accounts a LEFT JOIN finance_transactions t ON t.account_id=a.id AND ${realizedCash}
          AND ${visibleFinanceMovement(3,4)}
        WHERE a.is_active=true GROUP BY a.id ORDER BY a.currency,a.name`,[dateFrom||null,dateTo||null,canSeeAll,actor?.id??null]),
      this.db.query(`SELECT t.id,t.account_id,a.name AS account_name,a.currency,t.amount,t.counterparty_name,t.reference_number,t.description,t.occurred_at
        FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id
        WHERE ${pendingCollection} AND ${period} ORDER BY t.occurred_at DESC`,[dateFrom||null,dateTo||null]),
    ]);
    return {dateFrom:dateFrom||null,dateTo:dateTo||null,accounts:accounts.rows,unmatchedCollections:unmatched.rows};
  }
  async listMarketplaceSettlements() {
    return (await this.db.query(`SELECT s.*,a.name AS account_name, a.currency FROM marketplace_settlements s JOIN finance_accounts a ON a.id=s.account_id ORDER BY s.occurred_at DESC LIMIT 100`)).rows;
  }
  async listCarrierSettlements() {
    return (await this.db.query(`SELECT s.*,a.name AS account_name,a.currency
      FROM carrier_settlements s JOIN finance_accounts a ON a.id=s.account_id
      ORDER BY CASE WHEN s.status='PLANNED' THEN 0 ELSE 1 END,s.expected_payout_date ASC,s.created_at DESC LIMIT 200`)).rows;
  }
  async createCarrierSettlement(dto: CreateCarrierSettlementDto, actor: RequestUser) {
    const shipping = dto.shippingDeductionAmount ?? 0;
    const other = dto.otherDeductionAmount ?? 0;
    const net = Number((dto.grossCollectionAmount - shipping - other).toFixed(2));
    if (net < 0) throw new BadRequestException('Kargo ve diğer kesintiler brüt tahsilattan yüksek olamaz');
    return this.db.transaction(async client => {
      const account = await client.query<{ id:string }>(`SELECT id FROM finance_accounts WHERE id=$1 AND is_active=true AND currency='TRY' FOR KEY SHARE`, [dto.accountId]);
      if (!account.rowCount) throw new BadRequestException('Tahsilatın yatacağı aktif TL hesabını seçin');
      const result = await client.query<{id:string}>(`INSERT INTO carrier_settlements(account_id,carrier_name,reference_number,gross_collection_amount,shipping_deduction_amount,other_deduction_amount,net_payout_amount,expected_payout_date,note,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [dto.accountId,dto.carrierName.trim(),dto.referenceNumber?.trim()||null,dto.grossCollectionAmount,shipping,other,net,dto.expectedPayoutDate,dto.note?.trim()||null,actor.id]);
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)`, [actor.id,'finance.carrier_settlement.created','carrier_settlement',result.rows[0].id,JSON.stringify({carrier:dto.carrierName.trim(),net,expectedPayoutDate:dto.expectedPayoutDate})]);
      return {id:result.rows[0].id,netPayoutAmount:net,status:'PLANNED'};
    });
  }
  async markCarrierSettlementPaid(id:string, actor:RequestUser) {
    return this.db.transaction(async client => {
      const settlement=await client.query<{id:string;account_id:string;carrier_name:string;reference_number:string|null;net_payout_amount:string;expected_payout_date:string;status:string}>(`SELECT * FROM carrier_settlements WHERE id=$1 FOR UPDATE`,[id]);
      if(!settlement.rowCount) throw new BadRequestException('Kargo tahsilat kaydı bulunamadı');
      if(settlement.rows[0].status==='PAID') return {id,status:'PAID',replayed:true};
      const row=settlement.rows[0];
      const transaction=await client.query<{id:string}>(`INSERT INTO finance_transactions(account_id,kind,amount,payment_status,counterparty_name,reference_number,description,occurred_at,created_by)
        VALUES($1,'COLLECTION',$2,'PAID',$3,$4,$5,now(),$6) RETURNING id`,[row.account_id,row.net_payout_amount,row.carrier_name,row.reference_number,`${row.carrier_name} kargo tahsilatı · planlanan ödeme ${String(row.expected_payout_date).slice(0,10)}`,actor.id]);
      await client.query(`UPDATE carrier_settlements SET status='PAID',paid_at=now(),finance_transaction_id=$1,updated_at=now() WHERE id=$2`,[transaction.rows[0].id,id]);
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)`,[actor.id,'finance.carrier_settlement.paid','carrier_settlement',id,JSON.stringify({financeTransactionId:transaction.rows[0].id})]);
      return {id,status:'PAID',financeTransactionId:transaction.rows[0].id};
    });
  }
  async pendingCollections() {
    return (await this.db.query(`SELECT t.*, a.name AS account_name, a.currency FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id WHERE ${pendingCollection} ORDER BY t.occurred_at ASC, t.id`)).rows;
  }
  async dashboard(actor?:RequestUser) {
    const canSeeAll=actor?(await new StaffChannelService(this.db).access(actor)).canSeeAll:true;
    const result = await this.db.query<{ income: string; expense: string; net: string; pending_collection: string }>(`WITH totals AS (
      SELECT
        COALESCE(SUM(t.amount) FILTER (WHERE today AND ${realizedCash} AND t.kind IN ('INCOME','COLLECTION','TRANSFER_IN')),0) AS income,
        COALESCE(SUM(t.amount) FILTER (WHERE today AND ${realizedCash} AND t.kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT')),0) AS expense,
        COALESCE(SUM(t.amount) FILTER (WHERE ${pendingCollection}),0) AS pending_collection
      FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id
      CROSS JOIN LATERAL (SELECT (t.occurred_at AT TIME ZONE 'Europe/Istanbul')::date=(now() AT TIME ZONE 'Europe/Istanbul')::date AS today) day
      WHERE a.currency='TRY' AND ${visibleFinanceMovement(1,2)}
    ) SELECT income::text,expense::text,(income-expense)::text AS net,pending_collection::text FROM totals`,[canSeeAll,actor?.id??null]);
    return result.rows[0];
  }
  async alerts(actor:RequestUser) {
    const {canSeeAll}=await new StaffChannelService(this.db).access(actor);
    const result = await this.db.query<{ code: string; title: string; detail: string; severity: string }>(`
      WITH movements AS (
        SELECT t.*,a.currency FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id
        WHERE ${visibleFinanceMovement(1,2)}
      ), balances AS (
        SELECT a.id,a.name,a.currency,COALESCE(SUM(CASE WHEN t.kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') THEN -t.amount ELSE t.amount END),0) balance
        FROM finance_accounts a LEFT JOIN movements t ON t.account_id=a.id AND ${realizedCash} GROUP BY a.id
      ), overdue_current_accounts AS (
        SELECT e.amount,e.currency,e.due_at,COALESCE(d.company_name,NULLIF(trim(concat_ws(' ',c.first_name,c.last_name)),''),c.email,'Cari hesap') party_name
        FROM current_account_entries e LEFT JOIN dealers d ON d.id=e.dealer_id LEFT JOIN customers c ON c.id=e.customer_id
        WHERE e.direction='DEBIT' AND e.due_at<(now() AT TIME ZONE 'Europe/Istanbul')::date
      ), alerts AS (
        SELECT 'NEGATIVE_ACCOUNT' code,'Negatif hesap bakiyesi' title,name || ': ' || balance::text || ' ' || currency detail,'HIGH' severity FROM balances WHERE balance<0
        UNION ALL SELECT 'UNMATCHED_TRANSFER','Eşleşmemiş tahsilat','Referans veya gönderici bilgisi eksik: ' || amount::text || ' ' || currency,'MEDIUM' FROM movements t WHERE ${pendingCollection} AND (reference_number IS NULL OR counterparty_name IS NULL)
        UNION ALL SELECT 'OVERDUE_COLLECTION','Gecikmiş tahsilat',description || ': ' || amount::text || ' ' || currency,'HIGH' FROM movements t WHERE ${pendingCollection} AND payment_status='OVERDUE'
        UNION ALL SELECT 'OVERDUE_CURRENT_ACCOUNT','Vadesi geçmiş cari satış',party_name || ': ' || amount::text || ' ' || currency || ' · vade ' || due_at::text,'HIGH' FROM overdue_current_accounts
        UNION ALL SELECT 'MISSING_REFERENCE','Belgesiz masraf','Belge/dekont girilmemiş: ' || amount::text || ' ' || currency,'LOW' FROM movements t WHERE ${realizedCash} AND kind IN ('EXPENSE','COMMISSION','PRIME_EXPENSE') AND reference_number IS NULL
      ) SELECT * FROM alerts ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,code,detail LIMIT 50`,[canSeeAll,actor.id]);
    return result.rows;
  }
  async budgets(period?: string) {
    const target = period ? `${period.slice(0,7)}-01` : new Date().toISOString().slice(0,7) + '-01';
    return (await this.db.query(`SELECT b.*,COALESCE(SUM(t.amount) FILTER (WHERE t.kind='EXPENSE' AND t.expense_category=b.expense_category AND COALESCE(t.cost_center,'')=b.cost_center),0)::text actual_amount FROM finance_budgets b LEFT JOIN finance_transactions t ON t.occurred_at>=b.period_start AND t.occurred_at<(b.period_start+interval '1 month') AND t.payment_status<>'REFUNDED' GROUP BY b.id ORDER BY b.expense_category,b.cost_center`,[target])).rows;
  }
  async createBudget(dto: CreateFinanceBudgetDto, actor: RequestUser) {
    try { const result=await this.db.query<{id:string}>('INSERT INTO finance_budgets(period_start,expense_category,cost_center,amount,currency,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[dto.periodStart,dto.expenseCategory.trim(),dto.costCenter?.trim()||'',dto.amount,dto.currency??'TRY',dto.description?.trim()||null,actor.id]); await this.db.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[actor.id,'finance.budget.created','finance_budget',result.rows[0].id]); return result.rows[0]; }
    catch(error:unknown) { if((error as {code?:string}).code==='23505') throw new BadRequestException('Bu dönem, kategori ve masraf merkezi için bütçe zaten var'); throw error; }
  }
  async cashFlowProjection(actor:RequestUser) {
    const {canSeeAll}=await new StaffChannelService(this.db).access(actor);
    return (await this.db.query(`SELECT a.currency,
      COALESCE(SUM(CASE WHEN t.kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') THEN -t.amount ELSE t.amount END)
        FILTER (WHERE ${realizedCash}),0)::text current_balance,
      COALESCE(SUM(t.amount) FILTER (WHERE ${pendingCollection}),0)::text pending_collections,
      COALESCE((SELECT SUM(amount) FROM finance_budgets b
        WHERE b.period_start=date_trunc('month',now() AT TIME ZONE 'Europe/Istanbul')::date AND b.currency=a.currency),0)::text monthly_budget
      FROM finance_accounts a LEFT JOIN finance_transactions t ON t.account_id=a.id AND ${visibleFinanceMovement(1,2)}
      GROUP BY a.currency ORDER BY a.currency`,[canSeeAll,actor.id])).rows;
  }
  async createTransaction(dto: CreateFinanceTransactionDto, actor: RequestUser) {
    const description=dto.description.trim();
    if(!description) throw new BadRequestException('İşlem açıklaması zorunludur');
    return this.db.transaction(async client=>{
      const account=await client.query('SELECT id FROM finance_accounts WHERE id=$1 AND is_active=true FOR KEY SHARE',[dto.accountId]);
      if(!account.rowCount) throw new BadRequestException('Aktif finans hesabı bulunamadı');
      const result = await client.query<{ id: string }>('INSERT INTO finance_transactions(account_id,kind,amount,payment_status,counterparty_name,reference_number,expense_category,cost_center,document_url,description,occurred_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz,now()),$12) RETURNING id', [dto.accountId, dto.kind, dto.amount, dto.paymentStatus ?? null, dto.counterpartyName?.trim() || null, dto.referenceNumber?.trim() || null, dto.expenseCategory?.trim() || null, dto.costCenter?.trim() || null, dto.documentUrl?.trim() || null, description, dto.occurredAt ?? null, actor.id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[actor.id,'finance.transaction.created','finance_transaction',result.rows[0].id,JSON.stringify({kind:dto.kind,amount:dto.amount,accountId:dto.accountId})]);
      return result.rows[0];
    });
  }
  private async editableTransaction(client: import('pg').PoolClient,id:string) {
    const result=await client.query<{locked:boolean}>(`SELECT
      (t.order_id IS NOT NULL OR t.transfer_group_id IS NOT NULL OR t.approved_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM marketplace_settlements m WHERE m.finance_transaction_id=t.id)
        OR EXISTS (SELECT 1 FROM carrier_settlements s WHERE s.finance_transaction_id=t.id)
        OR EXISTS (SELECT 1 FROM return_refunds r WHERE r.finance_transaction_id=t.id)
        OR EXISTS (SELECT 1 FROM commission_entries e WHERE e.finance_transaction_id=t.id)
        OR EXISTS (SELECT 1 FROM dealer_prim_requests p WHERE p.finance_transaction_id=t.id)) AS locked
      FROM finance_transactions t WHERE t.id=$1 FOR UPDATE OF t`,[id]);
    const transaction=result.rows[0];
    if(!transaction) throw new BadRequestException('Para hareketi bulunamadı');
    if(transaction.locked) throw new BadRequestException('Başka Bir İşleme Bağlı Para Hareketi Değiştirilemez Veya Silinemez.');
  }
  async updateTransaction(id:string,dto:CreateFinanceTransactionDto,actor:RequestUser) {
    const description=dto.description.trim(); if(!description) throw new BadRequestException('İşlem açıklaması zorunludur');
    return this.db.transaction(async client=>{
      await this.editableTransaction(client,id);
      const account=await client.query('SELECT id FROM finance_accounts WHERE id=$1 AND is_active=true FOR KEY SHARE',[dto.accountId]); if(!account.rowCount) throw new BadRequestException('Aktif finans hesabı bulunamadı');
      await client.query('UPDATE finance_transactions SET account_id=$1,kind=$2,amount=$3,payment_status=$4,counterparty_name=$5,reference_number=$6,expense_category=$7,cost_center=$8,document_url=$9,description=$10,occurred_at=COALESCE($11::timestamptz,occurred_at) WHERE id=$12',[dto.accountId,dto.kind,dto.amount,dto.paymentStatus??null,dto.counterpartyName?.trim()||null,dto.referenceNumber?.trim()||null,dto.expenseCategory?.trim()||null,dto.costCenter?.trim()||null,dto.documentUrl?.trim()||null,description,dto.occurredAt??null,id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[actor.id,'finance.transaction.updated','finance_transaction',id]); return {id};
    });
  }
  async deleteTransaction(id:string,actor:RequestUser) {
    return this.db.transaction(async client=>{
      await this.editableTransaction(client,id);
      await client.query('DELETE FROM finance_transactions WHERE id=$1',[id]); await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[actor.id,'finance.transaction.deleted','finance_transaction',id]); return {id,deleted:true};
    });
  }
  async createMarketplaceSettlement(dto: CreateMarketplaceSettlementDto, actor: RequestUser) {
    const commission = dto.commissionAmount ?? 0; const shipping = dto.shippingCostAmount ?? 0; const campaign = dto.campaignContributionAmount ?? 0; const refund = dto.refundAmount ?? 0;
    const net = Number((dto.grossSalesAmount - commission - shipping - campaign - refund).toFixed(2));
    if (net < 0) throw new Error('Kesintiler brüt satış tutarından yüksek olamaz');
    return this.db.transaction(async client => {
      const account = await client.query<{ id: string }>(`SELECT id FROM finance_accounts WHERE id=$1 AND account_type='MARKETPLACE' AND is_active=true FOR UPDATE`, [dto.accountId]);
      if (!account.rowCount) throw new Error('Aktif bir pazar yeri hesabı seçin');
      const transaction = await client.query<{ id: string }>(`INSERT INTO finance_transactions(account_id,kind,amount,payment_status,counterparty_name,reference_number,description,occurred_at,created_by) VALUES ($1,'COLLECTION',$2,'PAID',$3,$4,$5,COALESCE($6::timestamptz,now()),$7) RETURNING id`, [dto.accountId, net, dto.marketplaceName.trim(), dto.referenceNumber?.trim() || null, `${dto.marketplaceName.trim()} net tahsilatı`, dto.occurredAt ?? null, actor.id]);
      const settlement = await client.query<{ id: string }>(`INSERT INTO marketplace_settlements(account_id,finance_transaction_id,marketplace_name,reference_number,gross_sales_amount,commission_amount,shipping_cost_amount,campaign_contribution_amount,refund_amount,net_collection_amount,occurred_at,note,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz,now()),$12,$13) RETURNING id`, [dto.accountId, transaction.rows[0].id, dto.marketplaceName.trim(), dto.referenceNumber?.trim() || null, dto.grossSalesAmount, commission, shipping, campaign, refund, net, dto.occurredAt ?? null, dto.note?.trim() || null, actor.id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)', [actor.id, 'finance.marketplace_settlement.created', 'marketplace_settlement', settlement.rows[0].id, JSON.stringify({ net, marketplace: dto.marketplaceName.trim() })]);
      return { id: settlement.rows[0].id, transactionId: transaction.rows[0].id, netCollectionAmount: net };
    });
  }
  async createTransfer(dto: CreateFinanceTransferDto, actor: RequestUser) {
    if (dto.fromAccountId === dto.toAccountId) throw new Error('Transfer source and target accounts must differ');
    return this.db.transaction(async client => {
      const accounts = await client.query<{id:string;currency:string}>("SELECT id,currency FROM finance_accounts WHERE id=ANY($1::uuid[]) AND is_active=true ORDER BY id FOR UPDATE",[[dto.fromAccountId,dto.toAccountId]]);
      if(accounts.rows.length!==2 || accounts.rows[0].currency!==accounts.rows[1].currency) throw new BadRequestException('Transfer için aynı para biriminde iki aktif hesap seçin; otomatik döviz dönüşümü yapılmaz');
      const group = await client.query<{ id: string }>('SELECT gen_random_uuid() AS id');
      const transferGroupId = group.rows[0].id;
      const values = (accountId: string) => [accountId, dto.amount, dto.description.trim(), transferGroupId, actor.id];
      await client.query('INSERT INTO finance_transactions(account_id,kind,amount,description,transfer_group_id,created_by) VALUES ($1,\'TRANSFER_OUT\',$2,$3,$4,$5)', values(dto.fromAccountId));
      await client.query('INSERT INTO finance_transactions(account_id,kind,amount,description,transfer_group_id,created_by) VALUES ($1,\'TRANSFER_IN\',$2,$3,$4,$5)', values(dto.toAccountId));
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [actor.id, 'finance.transfer.created', 'finance_transfer', transferGroupId, JSON.stringify({ fromAccountId: dto.fromAccountId, toAccountId: dto.toAccountId, amount: dto.amount })]);
      return { transferGroupId };
    });
  }
  async approveCollection(id: string, dto: ApproveCollectionDto, actor: RequestUser) {
    return this.db.transaction(async client => {
      const collection = await client.query<{ id: string; amount: string; currency:string }>(`SELECT t.id,t.amount,a.currency FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id WHERE t.id=$1 AND a.is_active AND ${pendingCollection} FOR UPDATE OF t`, [id]);
      if (!collection.rowCount) throw new BadRequestException('Bekleyen havale kaydı bulunamadı veya daha önce onaylandı');
      const order = await client.query<{ id: string; status: string; sales_status:string; total_amount: string; checkout_id: string; currency:string }>(`SELECT o.id,o.status,${reportOrderStatus} AS sales_status,o.total_amount,o.checkout_id,o.currency FROM orders o WHERE o.archived_at IS NULL AND (o.id::text=$1 OR o.order_number=$1) FOR UPDATE OF o`, [dto.orderId.trim()]);
      if (!order.rowCount) throw new BadRequestException('Sipariş bulunamadı');
      const orderId = order.rows[0].id;
      if(order.rows[0].status==='CANCELLED') throw new BadRequestException('İptal edilmiş siparişe tahsilat bağlanamaz');
      if(order.rows[0].sales_status==='REFUNDED') throw new BadRequestException('Tamamen iade edilmiş siparişe tahsilat bağlanamaz');
      if(collection.rows[0].currency?.trim()!==order.rows[0].currency?.trim() || !order.rows[0].currency) throw new BadRequestException('Tahsilat hesabı ve sipariş aynı para biriminde olmalı');
      const payment = (await client.query<{id:string;provider:string;status:string;currency:string}>(
        'SELECT id,provider,status,currency FROM payments WHERE checkout_id=$1 FOR UPDATE', [order.rows[0].checkout_id],
      )).rows[0];
      if (!payment || !(manualPaymentProviders.includes(payment.provider) || payment.provider==='cash_on_delivery')) {
        throw new BadRequestException('Siparişin ödeme yöntemi manuel tahsilata uygun değil');
      }
      if (payment.status !== 'PENDING') throw new BadRequestException('Bu siparişin bekleyen ödemesi yok');
      if (payment.currency !== collection.rows[0].currency) throw new BadRequestException('Tahsilat hesabı ve ödeme aynı para biriminde olmalı');
      const approved = await client.query<{ total: string }>(`SELECT COALESCE(SUM(t.amount),0)::text AS total
        FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id
        WHERE t.order_id=$1 AND t.kind='COLLECTION' AND t.payment_status='PAID' AND t.approved_at IS NOT NULL AND a.currency=$2`, [orderId, payment.currency]);
      const alreadyCollected = cents(approved.rows[0]?.total ?? 0);
      const collectionAmount = cents(collection.rows[0].amount);
      const orderTotal = cents(order.rows[0].total_amount);
      const newCollectedTotal = alreadyCollected + collectionAmount;
      if (newCollectedTotal > orderTotal) throw new BadRequestException('Bu havale siparişin kalan bakiyesinden yüksek');
      await client.query(`UPDATE finance_transactions SET order_id=$1,payment_status='PAID',approved_by=$2,approved_at=now() WHERE id=$3`, [orderId, actor.id, id]);
      const collectedTotal = Number(newCollectedTotal) / 100;
      const outstandingAmount = Number(orderTotal - newCollectedTotal) / 100;
      let orderStatus = order.rows[0].status;
      if (outstandingAmount === 0) {
        await client.query(`UPDATE payments SET status='SUCCEEDED',verified_at=now() WHERE id=$1 AND status='PENDING'`, [payment.id]);
        await client.query(`UPDATE payment_attempts SET status='SUCCEEDED' WHERE payment_id=$1 AND status='PENDING'`, [payment.id]);
      }
      if (outstandingAmount === 0 && orderStatus === 'PENDING_PAYMENT') {
        await client.query(`UPDATE orders SET status='PAID' WHERE id=$1`, [orderId]);
        await client.query(`INSERT INTO order_status_history(order_id,status) VALUES ($1,'PAID')`, [orderId]);
        const warehouses = await client.query<{ warehouse_id: string }>(`SELECT DISTINCT warehouse_id FROM stock_reservations WHERE reference_type='checkout' AND reference_id=$1 AND status='ACTIVE' LIMIT 2`, [order.rows[0].checkout_id]);
        if (warehouses.rows.length === 1) {
          const pick = await client.query<{ id: string }>(`INSERT INTO picking_sessions(order_id,warehouse_id,status) VALUES ($1,$2,'OPEN') ON CONFLICT (order_id) DO NOTHING RETURNING id`, [orderId, warehouses.rows[0].warehouse_id]);
          if (pick.rows[0]) {
            const orderItems = await client.query<{ id: string; quantity: number }>(`SELECT id,quantity FROM order_items WHERE order_id=$1`, [orderId]);
            for (const item of orderItems.rows) await client.query(`INSERT INTO picking_items(picking_session_id,order_item_id,expected_quantity) VALUES ($1,$2,$3)`, [pick.rows[0].id, item.id, item.quantity]);
          }
        }
        orderStatus = 'PAID';
      }
      await client.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)', [actor.id, 'finance.collection.approved', 'finance_transaction', id, JSON.stringify({ orderId, orderNumber: dto.orderId, amount: collection.rows[0].amount, collectedTotal, outstandingAmount, orderStatus })]);
      return { collectionId: id, orderId, paymentStatus: 'PAID', orderStatus, collectedTotal, outstandingAmount };
    });
  }
}
