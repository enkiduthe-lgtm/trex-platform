import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestReturnDto } from './dto/request-return.dto';
import { InspectReturnDto, RefundReturnDto } from './dto/return-operation.dto';
import { CommissionsService } from '../commissions/commissions.service';

@Injectable()
export class ReturnsService {
  constructor(private readonly db: DatabaseService, private readonly commissions?: CommissionsService) {}

  async request(dto: RequestReturnDto) {
    return this.db.transaction(async client => {
      const order = await client.query(`SELECT o.id FROM orders o JOIN checkout_sessions cs ON cs.id=o.checkout_id WHERE o.id=$1 AND lower(cs.contact_email)=lower($2) AND o.status IN ('PAID','PROCESSING','SHIPPED','DELIVERED') FOR UPDATE`, [dto.orderId,dto.contactEmail.trim()]);
      if (!order.rowCount) throw new NotFoundException('İade edilebilir sipariş bulunamadı');
      for (const item of dto.items) {
        const orderItem = await client.query<{ quantity: number }>('SELECT quantity FROM order_items WHERE id=$1 AND order_id=$2', [item.orderItemId, dto.orderId]);
        if (!orderItem.rows[0] || item.quantity > orderItem.rows[0].quantity) throw new ConflictException('İade miktarı sipariş miktarını aşıyor');
        const requested = await client.query<{ quantity: string }>(`SELECT COALESCE(SUM(ri.quantity),0)::text AS quantity FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.order_item_id=$1 AND r.status NOT IN ('REJECTED','CANCELLED')`, [item.orderItemId]);
        if (Number(requested.rows[0]?.quantity ?? 0) + item.quantity > orderItem.rows[0].quantity) throw new ConflictException('Bu ürün için kalan iade hakkı aşılıyor');
      }
      const created = await client.query<{ id: string }>('INSERT INTO returns (order_id,reason) VALUES ($1,$2) RETURNING id', [dto.orderId,dto.reason.trim()]);
      for (const item of dto.items) await client.query('INSERT INTO return_items (return_id,order_item_id,quantity) VALUES ($1,$2,$3)', [created.rows[0].id,item.orderItemId,item.quantity]);
      await client.query('INSERT INTO audit_logs(action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4)',['return.requested','return',created.rows[0].id,JSON.stringify({orderId:dto.orderId})]);
      return { returnId:created.rows[0].id,status:'REQUESTED' };
    });
  }

  async listAdmin() { return (await this.db.query(`SELECT (SELECT metadata->>'dealerId' FROM audit_logs WHERE entity_id=o.id AND entity_type='order' AND action='order.dealer.created' ORDER BY created_at LIMIT 1) AS dealer_id,(SELECT provider FROM payments WHERE checkout_id=o.checkout_id LIMIT 1) AS payment_provider,r.id,r.status,r.reason,r.requested_at,r.received_at,r.approved_at,r.rejected_at,r.completed_at,o.id AS order_id,o.order_number,o.total_amount,o.currency,COALESCE(SUM(ri.quantity),0) AS item_count,COALESCE(SUM(ri.quantity*oi.unit_amount),0) AS refundable_amount,
    COALESCE(json_agg(json_build_object('id',ri.id,'product_name',oi.product_name,'sku',oi.sku,'quantity',ri.quantity)) FILTER (WHERE ri.id IS NOT NULL),'[]'::json) AS items,
    rr.amount AS refund_amount,rr.currency AS refund_currency,fa.name AS refund_account_name,last_action.action AS last_action,last_action.created_at AS last_action_at,last_action.actor_email AS last_action_actor_email
    FROM returns r JOIN orders o ON o.id=r.order_id LEFT JOIN return_items ri ON ri.return_id=r.id LEFT JOIN order_items oi ON oi.id=ri.order_item_id LEFT JOIN return_refunds rr ON rr.return_id=r.id LEFT JOIN finance_transactions ft ON ft.id=rr.finance_transaction_id LEFT JOIN finance_accounts fa ON fa.id=ft.account_id
    LEFT JOIN LATERAL (SELECT a.action,a.created_at,u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.entity_type='return' AND a.entity_id=r.id ORDER BY a.created_at DESC LIMIT 1) last_action ON true
    GROUP BY r.id,o.id,rr.amount,rr.currency,fa.name,last_action.action,last_action.created_at,last_action.actor_email ORDER BY r.requested_at DESC LIMIT 100`)).rows; }

  private async transition(returnId:string, from:string[], to:string, actorId:string, note:string|undefined, action:string) {
    return this.db.transaction(async client=>{
      const row=await client.query<{order_id:string}>(`UPDATE returns SET status=$1,approved_by=CASE WHEN $1='APPROVED' THEN $2 ELSE approved_by END,approved_at=CASE WHEN $1='APPROVED' THEN now() ELSE approved_at END,rejected_by=CASE WHEN $1='REJECTED' THEN $2 ELSE rejected_by END,rejected_at=CASE WHEN $1='REJECTED' THEN now() ELSE rejected_at END,rejection_reason=CASE WHEN $1='REJECTED' THEN $3 ELSE rejection_reason END,received_at=CASE WHEN $1='RECEIVED' THEN now() ELSE received_at END WHERE id=$4 AND status=ANY($5::return_status[]) RETURNING order_id`,[to,actorId,note?.trim()||null,returnId,from]);
      if(!row.rowCount) throw new ConflictException('İade bu işlem için uygun durumda değil');
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[actorId,action,'return',returnId,JSON.stringify({from,to,note:note?.trim()||null,orderId:row.rows[0].order_id})]);
      return {returnId,status:to};
    });
  }
  approve(id:string,notes:string|undefined,actorId:string){return this.transition(id,['REQUESTED'],'APPROVED',actorId,notes,'return.approved');}
  reject(id:string,notes:string|undefined,actorId:string){return this.transition(id,['REQUESTED','APPROVED'],'REJECTED',actorId,notes,'return.rejected');}
  receive(id:string,notes:string|undefined,actorId:string){return this.transition(id,['APPROVED'],'RECEIVED',actorId,notes,'return.received');}

  async inspect(returnId:string,dto:InspectReturnDto,actorId:string) {
    return this.db.transaction(async client=>{
      const returned=await client.query<{order_id:string}>(`UPDATE returns SET status='INSPECTED' WHERE id=$1 AND status='RECEIVED' RETURNING order_id`,[returnId]);
      if(!returned.rowCount) throw new ConflictException('İade önce onaylanıp depoda teslim alınmalıdır');
      const warehouse=await client.query('SELECT id FROM warehouses WHERE id=$1 AND is_active=true FOR UPDATE',[dto.warehouseId]);
      if(!warehouse.rowCount) throw new ConflictException('Aktif bir depo seçin');
      const items=await client.query<{return_item_id:string;product_id:string;quantity:number}>(`SELECT ri.id AS return_item_id,oi.product_id,ri.quantity FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=$1 ORDER BY ri.id FOR UPDATE`,[returnId]);
      const specified = new Map((dto.items ?? []).map(item => [item.returnItemId, item.disposition]));
      if (specified.size && (specified.size !== items.rows.length || items.rows.some(item => !specified.has(item.return_item_id)))) throw new ConflictException('Her iade kalemi için stok durumu seçin');
      const defaultDisposition = dto.disposition;
      if (!specified.size && !defaultDisposition) throw new ConflictException('İade stok durumu zorunludur');
      for(const item of items.rows){
        const disposition = specified.get(item.return_item_id) ?? defaultDisposition!;
        await client.query('INSERT INTO return_item_dispositions(return_id,return_item_id,warehouse_id,disposition,quantity,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',[returnId,item.return_item_id,dto.warehouseId,disposition,item.quantity,dto.notes?.trim()||null,actorId]);
        const movement=disposition==='SELLABLE'?'RECEIPT':disposition==='QUARANTINE'?'RETURN_QUARANTINE':'RETURN_DAMAGED';
        if(disposition==='SELLABLE'){
          await client.query(`INSERT INTO inventory(product_id,warehouse_id,physical_quantity,reserved_quantity) VALUES($1,$2,$3,0) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET physical_quantity=inventory.physical_quantity+EXCLUDED.physical_quantity,updated_at=now()`,[item.product_id,dto.warehouseId,item.quantity]);
          await client.query(`INSERT INTO inventory_lots(product_id,warehouse_id,lot_code,available_quantity,location_code) VALUES($1,$2,$3,$4,'RETURN') ON CONFLICT(product_id,warehouse_id,lot_code) DO UPDATE SET available_quantity=inventory_lots.available_quantity+EXCLUDED.available_quantity`,[item.product_id,dto.warehouseId,`RETURN-${returnId}`,item.quantity]);
        }
        await client.query(`INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,created_by) VALUES($1,$2,$3,$4,'return',$5,$6)`,[item.product_id,dto.warehouseId,movement,disposition==='SELLABLE'?item.quantity:0,returnId,actorId]);
      }
      await client.query('INSERT INTO return_inspections(return_id,accepted,notes,inspected_by) VALUES($1,true,$2,$3)',[returnId,dto.notes?.trim()||null,actorId]);
      const dispositions = items.rows.map(item => ({ returnItemId:item.return_item_id, disposition:specified.get(item.return_item_id) ?? defaultDisposition! }));
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[actorId,'return.inspected','return',returnId,JSON.stringify({dispositions,warehouseId:dto.warehouseId,itemCount:items.rows.length})]);
      return {returnId,status:'INSPECTED',dispositions};
    });
  }

  async refund(returnId:string,dto:RefundReturnDto,actorId:string) {
    const result=await this.db.transaction(async client=>{
      const returned=await client.query<{order_id:string;total_amount:string;currency:string;order_number:string;checkout_id:string}>(`SELECT r.order_id,o.total_amount,o.currency,o.order_number,o.checkout_id FROM returns r JOIN orders o ON o.id=r.order_id WHERE r.id=$1 AND r.status='INSPECTED' FOR UPDATE`,[returnId]);
      if(!returned.rowCount) throw new ConflictException('Yalnızca incelenmiş iadeler için ödeme iadesi yapılabilir');
      await client.query("SELECT id FROM dealers WHERE id=(SELECT (metadata->>'dealerId')::uuid FROM audit_logs WHERE entity_type='order' AND entity_id=$1 AND action='order.dealer.created' ORDER BY created_at LIMIT 1) FOR UPDATE",[returned.rows[0].order_id]);
      const walletPayment=(await client.query<{id:string;amount:string}>("SELECT id,amount FROM payments WHERE checkout_id=$1 AND provider='dealer_commission' AND status='SUCCEEDED' FOR UPDATE",[returned.rows[0].checkout_id])).rows[0];
      if(walletPayment){
        const spend=(await client.query<{dealer_id:string;amount:string}>('SELECT dealer_id,amount FROM dealer_commission_spends WHERE order_id=$1',[returned.rows[0].order_id])).rows[0];
        if(!spend)throw new ConflictException('Prim Kullanım Kaydı Bulunamadı');
        await client.query('SELECT id FROM dealers WHERE id=$1 FOR UPDATE',[spend.dealer_id]);
        const bounds=(await client.query<{maximum:string;refunded:string}>('SELECT (SELECT COALESCE(SUM(ri.quantity*oi.unit_amount),0) FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=$1)::text AS maximum,(SELECT COALESCE(SUM(amount),0) FROM dealer_prim_refunds WHERE order_id=$2)::text AS refunded',[returnId,returned.rows[0].order_id])).rows[0];
        if(dto.amount>Number(bounds.maximum)||dto.amount+Number(bounds.refunded)>Number(spend.amount))throw new ConflictException('Prim İadesi İade Edilen Ürün Veya Kullanılan Prim Tutarını Aşamaz');
        await client.query('INSERT INTO dealer_prim_refunds(dealer_id,order_id,return_id,amount,created_by) VALUES($1,$2,$3,$4,$5)',[spend.dealer_id,returned.rows[0].order_id,returnId,dto.amount,actorId]);
        await client.query('INSERT INTO return_refunds(return_id,payment_id,amount,currency,created_by) VALUES($1,$2,$3,$4,$5)',[returnId,walletPayment.id,dto.amount,returned.rows[0].currency,actorId]);
        if(dto.amount+Number(bounds.refunded)>=Number(spend.amount))await client.query("UPDATE payments SET status='REFUNDED' WHERE id=$1",[walletPayment.id]);
        await client.query("UPDATE returns SET status='REFUNDED',completed_at=now() WHERE id=$1",[returnId]);
        await this.commissions?.reverseForOrder(returned.rows[0].order_id,actorId,'İade Finansal Olarak Tamamlandı',client,returnId);
        return {returnId,status:'REFUNDED',financeTransactionId:null,orderId:returned.rows[0].order_id};
      }
      if(!dto.accountId)throw new ConflictException('Nakit İade İçin Ödeme Hesabı Seçin');
      const account=await client.query<{id:string;currency:string}>('SELECT id,currency FROM finance_accounts WHERE id=$1 AND is_active=true FOR UPDATE',[dto.accountId]);
      if(!account.rowCount || account.rows[0].currency.trim()!==returned.rows[0].currency.trim()) throw new ConflictException('İade hesabı siparişle aynı para biriminde aktif bir hesap olmalıdır');
      const max=await client.query<{amount:string}>(`SELECT COALESCE(SUM(ri.quantity*oi.unit_amount),0)::text AS amount FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=$1`,[returnId]);
      if(dto.amount>Number(max.rows[0].amount)+0.0001) throw new ConflictException('İade tutarı iade edilen ürünlerin toplamını aşamaz');
      const payment=await client.query<{id:string;amount:string}>('SELECT id,amount FROM payments WHERE checkout_id=$1 AND status=\'SUCCEEDED\' ORDER BY verified_at DESC NULLS LAST,created_at DESC LIMIT 1 FOR UPDATE',[returned.rows[0].checkout_id]);
      const transaction=await client.query<{id:string}>(`INSERT INTO finance_transactions(account_id,order_id,kind,amount,payment_status,counterparty_name,reference_number,description,created_by) VALUES($1,$2,'REFUND',$3,'REFUNDED',$4,$5,$6,$7) RETURNING id`,[dto.accountId,returned.rows[0].order_id,dto.amount,returned.rows[0].order_number,dto.referenceNumber?.trim()||null,`${returned.rows[0].order_number} iade ödemesi`,actorId]);
      await client.query(`INSERT INTO return_refunds(return_id,payment_id,finance_transaction_id,amount,currency,created_by) VALUES($1,$2,$3,$4,$5,$6)`,[returnId,payment.rows[0]?.id??null,transaction.rows[0].id,dto.amount,returned.rows[0].currency,actorId]);
      if(payment.rows[0] && Math.abs(Number(payment.rows[0].amount)-dto.amount)<0.0001) await client.query("UPDATE payments SET status='REFUNDED' WHERE id=$1",[payment.rows[0].id]);
      await client.query("UPDATE returns SET status='REFUNDED',completed_at=now() WHERE id=$1",[returnId]);
      await this.commissions?.reverseForOrder(returned.rows[0].order_id,actorId,'İade Finansal Olarak Tamamlandı',client,returnId);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[actorId,'return.refunded','return',returnId,JSON.stringify({amount:dto.amount,accountId:dto.accountId,transactionId:transaction.rows[0].id})]);
      return {returnId,status:'REFUNDED',financeTransactionId:transaction.rows[0].id,orderId:returned.rows[0].order_id};
    });
    return result;
  }
}
