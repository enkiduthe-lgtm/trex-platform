import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { CreateFinanceRecordDto } from './dto/create-finance-record.dto';
import { CreateFinanceAccountDto } from './dto/create-finance-account.dto';
import { CreateFinanceTransactionDto, CreateFinanceTransferDto } from './dto/create-finance-transaction.dto';
import { ApproveCollectionDto } from './dto/approve-collection.dto';
import { CreateMarketplaceSettlementDto } from './dto/create-marketplace-settlement.dto';
@Injectable()
export class FinanceService {
  constructor(private readonly db: DatabaseService) {}
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
    const result = await this.db.query<{ id: string }>('INSERT INTO finance_accounts(name,account_type,created_by) VALUES ($1,$2,$3) RETURNING id', [dto.name.trim(), dto.accountType, actor.id]);
    return result.rows[0];
  }
  async listTransactions() {
    return (await this.db.query(`SELECT t.*, a.name AS account_name, o.order_number, u.email AS approved_by_email FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN users u ON u.id=t.approved_by ORDER BY t.occurred_at DESC, t.created_at DESC LIMIT 100`)).rows;
  }
  async listMarketplaceSettlements() {
    return (await this.db.query(`SELECT s.*,a.name AS account_name FROM marketplace_settlements s JOIN finance_accounts a ON a.id=s.account_id ORDER BY s.occurred_at DESC LIMIT 100`)).rows;
  }
  async pendingCollections() {
    return (await this.db.query(`SELECT t.*, a.name AS account_name FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id WHERE t.kind='COLLECTION' AND t.payment_status IN ('PENDING','COLLECTION_PENDING','PARTIALLY_PAID') AND t.approved_at IS NULL ORDER BY t.occurred_at ASC LIMIT 100`)).rows;
  }
  async dashboard() {
    const result = await this.db.query<{ income: string; expense: string; net: string; pending_collection: string }>(`SELECT COALESCE(SUM(CASE WHEN kind IN ('INCOME','COLLECTION','TRANSFER_IN') AND occurred_at >= date_trunc('day',now()) THEN amount ELSE 0 END),0)::text income, COALESCE(SUM(CASE WHEN kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') AND occurred_at >= date_trunc('day',now()) THEN amount ELSE 0 END),0)::text expense, COALESCE(SUM(CASE WHEN kind IN ('INCOME','COLLECTION','TRANSFER_IN') AND occurred_at >= date_trunc('day',now()) THEN amount WHEN kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') AND occurred_at >= date_trunc('day',now()) THEN -amount ELSE 0 END),0)::text net, COALESCE(SUM(CASE WHEN payment_status IN ('PENDING','PARTIALLY_PAID','COLLECTION_PENDING','OVERDUE') THEN amount ELSE 0 END),0)::text pending_collection FROM finance_transactions`);
    return result.rows[0];
  }
  async alerts() {
    const result = await this.db.query<{ code: string; title: string; detail: string; severity: string }>(`WITH balances AS (SELECT a.id,a.name,COALESCE(SUM(CASE WHEN t.kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT') THEN -t.amount ELSE t.amount END),0) balance FROM finance_accounts a LEFT JOIN finance_transactions t ON t.account_id=a.id GROUP BY a.id) SELECT 'NEGATIVE_ACCOUNT' code,'Negatif hesap bakiyesi' title,name || ': ' || balance::text || ' TL' detail,'HIGH' severity FROM balances WHERE balance < 0 UNION ALL SELECT 'UNMATCHED_TRANSFER','Eşleşmemiş havale','Referans veya gönderici bilgisi eksik: ' || amount::text || ' TL','MEDIUM' FROM finance_transactions WHERE kind='COLLECTION' AND (reference_number IS NULL OR counterparty_name IS NULL) UNION ALL SELECT 'OVERDUE_COLLECTION','Gecikmiş tahsilat',description || ': ' || amount::text || ' TL','HIGH' FROM finance_transactions WHERE payment_status='OVERDUE' UNION ALL SELECT 'MISSING_REFERENCE','Belgesiz masraf','Referans/dekont girilmemiş: ' || amount::text || ' TL','LOW' FROM finance_transactions WHERE kind IN ('EXPENSE','COMMISSION','PRIME_EXPENSE') AND reference_number IS NULL ORDER BY severity DESC LIMIT 50`);
    return result.rows;
  }
  async createTransaction(dto: CreateFinanceTransactionDto, actor: RequestUser) {
    const result = await this.db.query<{ id: string }>('INSERT INTO finance_transactions(account_id,kind,amount,payment_status,counterparty_name,reference_number,description,occurred_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,now()),$9) RETURNING id', [dto.accountId, dto.kind, dto.amount, dto.paymentStatus ?? null, dto.counterpartyName?.trim() || null, dto.referenceNumber?.trim() || null, dto.description.trim(), dto.occurredAt ?? null, actor.id]);
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
      const collection = await client.query<{ id: string; amount: string }>(`SELECT id,amount FROM finance_transactions WHERE id=$1 AND kind='COLLECTION' AND payment_status IN ('PENDING','COLLECTION_PENDING','PARTIALLY_PAID') AND approved_at IS NULL FOR UPDATE`, [id]);
      if (!collection.rowCount) throw new Error('Bekleyen havale kaydı bulunamadı veya daha önce onaylandı');
      const order = await client.query<{ id: string; status: string }>('SELECT id,status FROM orders WHERE id=$1 FOR UPDATE', [dto.orderId]);
      if (!order.rowCount) throw new Error('Sipariş bulunamadı');
      await client.query(`UPDATE finance_transactions SET order_id=$1,payment_status='PAID',approved_by=$2,approved_at=now() WHERE id=$3`, [dto.orderId, actor.id, id]);
      if (order.rows[0].status === 'PENDING_PAYMENT') await client.query(`UPDATE orders SET status='PAID' WHERE id=$1`, [dto.orderId]);
      await client.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)', [actor.id, 'finance.collection.approved', 'finance_transaction', id, JSON.stringify({ orderId: dto.orderId, amount: collection.rows[0].amount })]);
      return { collectionId: id, orderId: dto.orderId, paymentStatus: 'PAID' };
    });
  }
}
