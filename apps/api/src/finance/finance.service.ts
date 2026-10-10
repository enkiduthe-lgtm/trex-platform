import { BadRequestException, Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { CreateFinanceRecordDto } from './dto/create-finance-record.dto';
import { CreateFinanceAccountDto } from './dto/create-finance-account.dto';
import { CreateFinanceTransactionDto, CreateFinanceTransferDto } from './dto/create-finance-transaction.dto';
import { ApproveCollectionDto } from './dto/approve-collection.dto';
import { CreateMarketplaceSettlementDto } from './dto/create-marketplace-settlement.dto';
import { CreateFinanceBudgetDto } from './dto/create-finance-budget.dto';
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
  async listAccounts() {
    return (await this.db.query(`SELECT a.*, COALESCE(SUM(CASE WHEN t.kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') THEN -t.amount ELSE t.amount END),0) AS balance FROM finance_accounts a LEFT JOIN finance_transactions t ON t.account_id=a.id GROUP BY a.id ORDER BY a.created_at DESC`)).rows;
  }
  async createAccount(dto: CreateFinanceAccountDto, actor: RequestUser) {
    const result = await this.db.query<{ id: string }>('INSERT INTO finance_accounts(name,account_type,created_by,currency) VALUES ($1,$2,$3,$4) RETURNING id', [dto.name.trim(), dto.accountType, actor.id, dto.currency ?? 'TRY']);
    return result.rows[0];
  }
  async listTransactions() {
    return (await this.db.query(`SELECT t.*, a.name AS account_name, a.currency, o.order_number, u.email AS approved_by_email FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN users u ON u.id=t.approved_by ORDER BY t.occurred_at DESC, t.created_at DESC LIMIT 100`)).rows;
  }
  async listMarketplaceSettlements() {
    return (await this.db.query(`SELECT s.*,a.name AS account_name, a.currency FROM marketplace_settlements s JOIN finance_accounts a ON a.id=s.account_id ORDER BY s.occurred_at DESC LIMIT 100`)).rows;
  }
  async pendingCollections() {
    return (await this.db.query(`SELECT t.*, a.name AS account_name, a.currency FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id WHERE t.kind='COLLECTION' AND t.payment_status IN ('PENDING','COLLECTION_PENDING','PARTIALLY_PAID') AND t.approved_at IS NULL ORDER BY t.occurred_at ASC LIMIT 100`)).rows;
  }
  async dashboard() {
    const result = await this.db.query<{ income: string; expense: string; net: string; pending_collection: string }>(`SELECT COALESCE(SUM(CASE WHEN kind IN ('INCOME','COLLECTION','TRANSFER_IN') AND occurred_at >= date_trunc('day',now()) THEN amount ELSE 0 END),0)::text income, COALESCE(SUM(CASE WHEN kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') AND occurred_at >= date_trunc('day',now()) THEN amount ELSE 0 END),0)::text expense, COALESCE(SUM(CASE WHEN kind IN ('INCOME','COLLECTION','TRANSFER_IN') AND occurred_at >= date_trunc('day',now()) THEN amount WHEN kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') AND occurred_at >= date_trunc('day',now()) THEN -amount ELSE 0 END),0)::text net, COALESCE(SUM(CASE WHEN payment_status IN ('PENDING','PARTIALLY_PAID','COLLECTION_PENDING','OVERDUE') THEN amount ELSE 0 END),0)::text pending_collection FROM finance_transactions WHERE account_id IN (SELECT id FROM finance_accounts WHERE currency='TRY')`);
    return result.rows[0];
  }
  async alerts() {
    const result = await this.db.query<{ code: string; title: string; detail: string; severity: string }>(`WITH movements AS (SELECT t.*,a.currency FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id), balances AS (SELECT a.id,a.name,a.currency,COALESCE(SUM(CASE WHEN t.kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') THEN -t.amount ELSE t.amount END),0) balance FROM finance_accounts a LEFT JOIN finance_transactions t ON t.account_id=a.id GROUP BY a.id) SELECT 'NEGATIVE_ACCOUNT' code,'Negatif hesap bakiyesi' title,name || ': ' || balance::text || ' ' || currency detail,'HIGH' severity FROM balances WHERE balance < 0 UNION ALL SELECT 'UNMATCHED_TRANSFER','Eşleşmemiş tahsilat','Referans veya gönderici bilgisi eksik: ' || amount::text || ' ' || currency,'MEDIUM' FROM movements WHERE kind='COLLECTION' AND (reference_number IS NULL OR counterparty_name IS NULL) UNION ALL SELECT 'OVERDUE_COLLECTION','Gecikmiş tahsilat',description || ': ' || amount::text || ' ' || currency,'HIGH' FROM movements WHERE payment_status='OVERDUE' UNION ALL SELECT 'MISSING_REFERENCE','Belgesiz masraf','Referans/dekont girilmemiş: ' || amount::text || ' ' || currency,'LOW' FROM movements WHERE kind IN ('EXPENSE','COMMISSION','PRIME_EXPENSE') AND reference_number IS NULL ORDER BY severity DESC LIMIT 50`);
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
  async cashFlowProjection() {
    return (await this.db.query(`SELECT a.currency,COALESCE(SUM(CASE WHEN t.kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') THEN -t.amount ELSE t.amount END),0)::text current_balance,COALESCE(SUM(CASE WHEN t.payment_status IN ('PENDING','COLLECTION_PENDING','PARTIALLY_PAID','OVERDUE') THEN t.amount ELSE 0 END),0)::text pending_collections,COALESCE((SELECT SUM(amount) FROM finance_budgets b WHERE b.period_start=date_trunc('month',now())::date AND b.currency=a.currency),0)::text monthly_budget FROM finance_accounts a LEFT JOIN finance_transactions t ON t.account_id=a.id GROUP BY a.currency ORDER BY a.currency`)).rows;
  }
  async createTransaction(dto: CreateFinanceTransactionDto, actor: RequestUser) {
    const result = await this.db.query<{ id: string }>('INSERT INTO finance_transactions(account_id,kind,amount,payment_status,counterparty_name,reference_number,expense_category,cost_center,document_url,description,occurred_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz,now()),$12) RETURNING id', [dto.accountId, dto.kind, dto.amount, dto.paymentStatus ?? null, dto.counterpartyName?.trim() || null, dto.referenceNumber?.trim() || null, dto.expenseCategory?.trim() || null, dto.costCenter?.trim() || null, dto.documentUrl?.trim() || null, dto.description.trim(), dto.occurredAt ?? null, actor.id]);
    return result.rows[0];
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
      return { transferGroupId };
    });
  }
  async approveCollection(id: string, dto: ApproveCollectionDto, actor: RequestUser) {
    return this.db.transaction(async client => {
      const collection = await client.query<{ id: string; amount: string; currency:string }>(`SELECT t.id,t.amount,a.currency FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id WHERE t.id=$1 AND t.kind='COLLECTION' AND t.payment_status IN ('PENDING','COLLECTION_PENDING','PARTIALLY_PAID') AND t.approved_at IS NULL FOR UPDATE OF t`, [id]);
      if (!collection.rowCount) throw new Error('Bekleyen havale kaydı bulunamadı veya daha önce onaylandı');
      const order = await client.query<{ id: string; status: string; total_amount: string; checkout_id: string; currency:string }>('SELECT id,status,total_amount,checkout_id,currency FROM orders WHERE id=$1 FOR UPDATE', [dto.orderId]);
      if (!order.rowCount) throw new Error('Sipariş bulunamadı');
      if(order.rows[0].status==='CANCELLED') throw new BadRequestException('İptal edilmiş siparişe tahsilat bağlanamaz');
      if(collection.rows[0].currency?.trim()!==order.rows[0].currency?.trim() || !order.rows[0].currency) throw new BadRequestException('Tahsilat hesabı ve sipariş aynı para biriminde olmalı');
      const approved = await client.query<{ total: string }>(`SELECT COALESCE(SUM(amount),0)::text AS total FROM finance_transactions WHERE order_id=$1 AND kind='COLLECTION' AND approved_at IS NOT NULL`, [dto.orderId]);
      const alreadyCollected = Number(approved.rows[0]?.total ?? 0);
      const collectionAmount = Number(collection.rows[0].amount);
      const orderTotal = Number(order.rows[0].total_amount);
      const newCollectedTotal = Number((alreadyCollected + collectionAmount).toFixed(2));
      if (newCollectedTotal > orderTotal) throw new Error('Bu havale siparişin kalan bakiyesinden yüksek');
      await client.query(`UPDATE finance_transactions SET order_id=$1,payment_status='PAID',approved_by=$2,approved_at=now() WHERE id=$3`, [dto.orderId, actor.id, id]);
      const outstandingAmount = Number((orderTotal - newCollectedTotal).toFixed(2));
      let orderStatus = order.rows[0].status;
      if (outstandingAmount === 0 && orderStatus === 'PENDING_PAYMENT') {
        await client.query(`UPDATE orders SET status='PAID' WHERE id=$1`, [dto.orderId]);
        await client.query(`UPDATE payments SET status='SUCCEEDED',verified_at=now() WHERE checkout_id=$1 AND status='PENDING'`, [order.rows[0].checkout_id]);
        await client.query(`UPDATE payment_attempts SET status='SUCCEEDED' WHERE payment_id IN (SELECT id FROM payments WHERE checkout_id=$1)`, [order.rows[0].checkout_id]);
        await client.query(`INSERT INTO order_status_history(order_id,status) VALUES ($1,'PAID')`, [dto.orderId]);
        const warehouse = await client.query<{ warehouse_id: string }>(`SELECT warehouse_id FROM stock_reservations WHERE reference_type='checkout' AND reference_id=$1 ORDER BY created_at ASC LIMIT 1`, [order.rows[0].checkout_id]);
        if (warehouse.rows[0]) {
          const pick = await client.query<{ id: string }>(`INSERT INTO picking_sessions(order_id,warehouse_id,status) VALUES ($1,$2,'OPEN') ON CONFLICT (order_id) DO NOTHING RETURNING id`, [dto.orderId, warehouse.rows[0].warehouse_id]);
          if (pick.rows[0]) {
            const orderItems = await client.query<{ id: string; quantity: number }>(`SELECT id,quantity FROM order_items WHERE order_id=$1`, [dto.orderId]);
            for (const item of orderItems.rows) await client.query(`INSERT INTO picking_items(picking_session_id,order_item_id,expected_quantity) VALUES ($1,$2,$3)`, [pick.rows[0].id, item.id, item.quantity]);
          }
        }
        orderStatus = 'PAID';
      }
      if (outstandingAmount === 0 && ['PROCESSING','SHIPPED','DELIVERED'].includes(orderStatus)) {
        await client.query(`UPDATE payments SET status='SUCCEEDED',verified_at=now() WHERE checkout_id=$1 AND status='PENDING' AND provider IN ('cash_on_delivery_card','cash_on_delivery_cash')`, [order.rows[0].checkout_id]);
        await client.query(`UPDATE payment_attempts SET status='SUCCEEDED' WHERE payment_id IN (SELECT id FROM payments WHERE checkout_id=$1 AND status='SUCCEEDED' AND provider IN ('cash_on_delivery_card','cash_on_delivery_cash'))`, [order.rows[0].checkout_id]);
      }
      await client.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)', [actor.id, 'finance.collection.approved', 'finance_transaction', id, JSON.stringify({ orderId: dto.orderId, amount: collection.rows[0].amount, collectedTotal: newCollectedTotal, outstandingAmount, orderStatus })]);
      return { collectionId: id, orderId: dto.orderId, paymentStatus: 'PAID', orderStatus, collectedTotal: newCollectedTotal, outstandingAmount };
    });
  }
}
