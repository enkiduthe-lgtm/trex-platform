import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { editVersion } from './edit-version';
import { CommissionsService } from '../commissions/commissions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateInvoiceDraftDto } from './dto/create-invoice-draft.dto';
import { ParasutInvoiceProvider } from './parasut-invoice.provider';
@Injectable()
export class OrdersService { constructor(private readonly db: DatabaseService,private readonly commissions?: CommissionsService,private readonly notifications?: NotificationsService, private readonly parasut?: ParasutInvoiceProvider) {} async list(channel?:string) { const normalized=channel?.trim().toUpperCase(); const allowed=['PUBLIC_WEB','ADMIN_ORDER','RETAIL','WHOLESALE','INSTAGRAM','DEALER_PORTAL','MARKETPLACE']; if(normalized&&!allowed.includes(normalized)) throw new BadRequestException('Geçersiz satış kanalı'); return (await this.db.query(`SELECT o.id,o.order_number,o.status,o.total_amount,o.currency,o.created_at,o.sales_channel,o.marketplace_name,o.commission_amount,(SELECT ps.status FROM picking_sessions ps WHERE ps.order_id=o.id ORDER BY ps.created_at DESC LIMIT 1) AS preparation_status,o.shipping_cost_amount,s.provider AS shipping_provider,s.tracking_number,s.status AS shipment_status,COALESCE(c.email,cs.contact_email) AS customer_email,COALESCE(NULLIF(trim(concat_ws(' ',c.first_name,c.last_name)),''),NULLIF(trim(cs.contact_name),''),oa.recipient_name) AS customer_name,COALESCE(SUM(oi.quantity),0) AS item_count FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN checkout_sessions cs ON cs.id=o.checkout_id LEFT JOIN order_addresses oa ON oa.order_id=o.id LEFT JOIN shipments s ON s.order_id=o.id LEFT JOIN order_items oi ON oi.order_id=o.id WHERE ($1::sales_channel_code IS NULL OR o.sales_channel=$1::sales_channel_code) GROUP BY o.id,c.id,cs.id,oa.id,s.id ORDER BY o.created_at DESC LIMIT 100`,[normalized ?? null])).rows; }
  async salesReport(dateFrom?:string,dateTo?:string,channel?:string,product?:string,status?:string,customer?:string) {
    const normalized=channel?.trim().toUpperCase()||null; const allowed=['PUBLIC_WEB','ADMIN_ORDER','RETAIL','WHOLESALE','INSTAGRAM','DEALER_PORTAL','MARKETPLACE'];
    if(normalized&&!allowed.includes(normalized)) throw new BadRequestException('Geçersiz satış kanalı');
    for (const value of [dateFrom,dateTo]) if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value)) throw new BadRequestException('Geçerli Bir Tarih Seçin');
    if (dateFrom && dateTo && dateFrom > dateTo) throw new BadRequestException('Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz');
    if (status && !['PENDING_PAYMENT','PAID','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED'].includes(status)) throw new BadRequestException('Geçersiz Sipariş Durumu');
    return (await this.db.query(`SELECT o.id,oi.id AS item_id,o.order_number,o.status,o.sales_channel,o.total_amount,o.currency,o.created_at,
      COALESCE(NULLIF(trim(concat_ws(' ',c.first_name,c.last_name)),''),NULLIF(trim(cs.contact_name),''),oa.recipient_name,'Misafir') AS customer_name,
      oi.product_name,oi.sku,oi.quantity,oi.unit_amount,(oi.quantity*oi.unit_amount)::text AS line_total,
      COALESCE(payment.provider,'') AS payment_method
      FROM orders o JOIN order_items oi ON oi.order_id=o.id LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN checkout_sessions cs ON cs.id=o.checkout_id LEFT JOIN order_addresses oa ON oa.order_id=o.id
      LEFT JOIN LATERAL (SELECT provider FROM payments WHERE checkout_id=o.checkout_id ORDER BY created_at DESC LIMIT 1) payment ON true
      WHERE o.created_at>=COALESCE($1::date::timestamp AT TIME ZONE 'Europe/Istanbul','-infinity'::timestamptz)
        AND o.created_at<COALESCE(($2::date+1)::timestamp AT TIME ZONE 'Europe/Istanbul','infinity'::timestamptz)
        AND ($3::sales_channel_code IS NULL OR o.sales_channel=$3::sales_channel_code)
        AND ($4::text IS NULL OR oi.product_name ILIKE '%'||$4||'%' OR oi.sku ILIKE '%'||$4||'%')
        AND ($5::text IS NULL OR o.status::text=$5)
        AND ($6::text IS NULL OR concat_ws(' ',c.first_name,c.last_name,cs.contact_name,oa.recipient_name,c.email,cs.contact_email) ILIKE '%'||$6||'%')
      ORDER BY o.created_at DESC,o.order_number,oi.id`,[dateFrom||null,dateTo||null,normalized,product?.trim()||null,status||null,customer?.trim()||null])).rows;
  }
  async specialReport(dateFrom?:string,dateTo?:string) {
    const range=[dateFrom||null,dateTo||null];
    const [summary,products,payments,collections,expenses,stock,channelProducts,commissions]=await Promise.all([
      this.db.query(`SELECT
        (SELECT COALESCE(SUM(amount),0)::text FROM finance_transactions WHERE kind='COLLECTION' AND occurred_at>=COALESCE($1::date,'-infinity') AND occurred_at<COALESCE($2::date+1,'infinity')) incoming_transfers,
        (SELECT COALESCE(SUM(amount),0)::text FROM finance_transactions WHERE kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE') AND occurred_at>=COALESCE($1::date,'-infinity') AND occurred_at<COALESCE($2::date+1,'infinity')) expenses,
        (SELECT COALESCE(SUM(total_amount) FILTER(WHERE status<>'CANCELLED'),0)::text FROM orders WHERE created_at>=COALESCE($1::date,'-infinity') AND created_at<COALESCE($2::date+1,'infinity')) sales,
        (SELECT COALESCE(SUM(oi.quantity) FILTER(WHERE o.status<>'CANCELLED'),0)::int FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.created_at>=COALESCE($1::date,'-infinity') AND o.created_at<COALESCE($2::date+1,'infinity')) units_sold,
        (SELECT COALESCE(SUM(amount) FILTER(WHERE recipient_kind='STAFF' AND entry_kind='EARN'),0)::text FROM commission_entries WHERE created_at>=COALESCE($1::date,'-infinity') AND created_at<COALESCE($2::date+1,'infinity')) staff_commission,
        (SELECT COALESCE(SUM(amount) FILTER(WHERE recipient_kind='MANAGER' AND entry_kind='EARN'),0)::text FROM commission_entries WHERE created_at>=COALESCE($1::date,'-infinity') AND created_at<COALESCE($2::date+1,'infinity')) manager_commission`,range),
      this.db.query(`SELECT oi.product_name AS label,COALESCE(SUM(oi.quantity),0)::int quantity,COALESCE(SUM(oi.quantity*oi.unit_amount),0)::text amount FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status<>'CANCELLED' AND o.created_at>=COALESCE($1::date,'-infinity') AND o.created_at<COALESCE($2::date+1,'infinity') GROUP BY oi.product_name ORDER BY amount DESC`,range),
      this.db.query(`SELECT COALESCE(p.provider,'Bilinmiyor') AS label,COALESCE(SUM(p.amount),0)::text amount,count(*)::int quantity FROM payments p JOIN orders o ON o.checkout_id=p.checkout_id WHERE o.created_at>=COALESCE($1::date,'-infinity') AND o.created_at<COALESCE($2::date+1,'infinity') GROUP BY p.provider ORDER BY amount DESC`,range),
      this.db.query(`SELECT a.name AS account_name,COALESCE(t.cost_center,'Departman Yok') AS department,COALESCE(SUM(t.amount),0)::text amount,count(*)::int quantity FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id WHERE t.kind='COLLECTION' AND t.occurred_at>=COALESCE($1::date,'-infinity') AND t.occurred_at<COALESCE($2::date+1,'infinity') GROUP BY a.name,t.cost_center ORDER BY amount DESC`,range),
      this.db.query(`SELECT COALESCE(t.cost_center,'Departman Yok') AS department,COALESCE(t.expense_category,'Kategori Yok') AS category,COALESCE(SUM(t.amount),0)::text amount,count(*)::int quantity FROM finance_transactions t WHERE t.kind='EXPENSE' AND t.occurred_at>=COALESCE($1::date,'-infinity') AND t.occurred_at<COALESCE($2::date+1,'infinity') GROUP BY t.cost_center,t.expense_category ORDER BY amount DESC`,range),
      this.db.query(`SELECT p.name AS product_name,p.sku,COALESCE(SUM(i.physical_quantity-i.reserved_quantity),0)::int quantity FROM products p LEFT JOIN inventory i ON i.product_id=p.id GROUP BY p.id ORDER BY quantity,p.name`),
      this.db.query(`SELECT o.sales_channel,oi.product_name,COALESCE(SUM(oi.quantity),0)::int quantity,COALESCE(SUM(oi.quantity*oi.unit_amount),0)::text amount FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.status<>'CANCELLED' AND o.created_at>=COALESCE($1::date,'-infinity') AND o.created_at<COALESCE($2::date+1,'infinity') GROUP BY o.sales_channel,oi.product_name ORDER BY amount DESC`,range),
      this.db.query(`SELECT COALESCE(u.email,'Bilinmiyor') AS person,e.recipient_kind,o.sales_channel,oi.product_name,COALESCE(SUM(oi.quantity),0)::int quantity,COALESCE(SUM(e.amount),0)::text amount FROM commission_entries e JOIN users u ON u.id=e.recipient_user_id JOIN orders o ON o.id=e.order_id JOIN order_items oi ON oi.id=e.order_item_id WHERE e.entry_kind='EARN' AND e.created_at>=COALESCE($1::date,'-infinity') AND e.created_at<COALESCE($2::date+1,'infinity') GROUP BY u.email,e.recipient_kind,o.sales_channel,oi.product_name ORDER BY amount DESC`,range),
    ]);
    return {dateFrom:dateFrom||null,dateTo:dateTo||null,summary:summary.rows[0]??{},products:products.rows,payments:payments.rows,collections:collections.rows,expenses:expenses.rows,stock:stock.rows,channelProducts:channelProducts.rows,commissions:commissions.rows};
  }
  async listNotes() { return (await this.db.query<{id:string;admin_note:string|null}>('SELECT id,admin_note FROM orders WHERE admin_note IS NOT NULL ORDER BY created_at DESC LIMIT 100')).rows; }
  async updateNote(id:string,note:string|undefined,userId:string) { const value=note?.trim()||null; const result=await this.db.query<{id:string;admin_note:string|null}>('UPDATE orders SET admin_note=$1 WHERE id=$2 RETURNING id,admin_note',[value,id]); if(!result.rowCount) throw new NotFoundException('Sipariş bulunamadı'); await this.db.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[userId,'order.admin_note.updated','order',id,JSON.stringify({hasNote:Boolean(value)})]); return result.rows[0]; }
  async invoice(orderId:string) { return (await this.db.query('SELECT * FROM order_invoices WHERE order_id=$1',[orderId])).rows[0]??null; }
  async createInvoiceDraft(orderId:string,dto:CreateInvoiceDraftDto,actor:RequestUser) {
    const individual=dto.customerType==='INDIVIDUAL';
    if(individual&&!dto.identityNumber) throw new BadRequestException('Bireysel fatura için T.C. kimlik no zorunludur');
    if(!individual&&(!dto.companyName||!dto.taxNumber)) throw new BadRequestException('Kurumsal fatura için firma unvanı ve vergi no zorunludur');
    return this.db.transaction(async client=>{
      const order=await client.query('SELECT id,status FROM orders WHERE id=$1 FOR KEY SHARE',[orderId]); if(!order.rowCount) throw new NotFoundException('Sipariş bulunamadı');
      const row=await client.query<{id:string}>(`INSERT INTO order_invoices(order_id,customer_type,recipient_name,identity_number,company_name,tax_number,tax_office,billing_address,billing_city,billing_district,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(order_id) DO UPDATE SET customer_type=EXCLUDED.customer_type,recipient_name=EXCLUDED.recipient_name,identity_number=EXCLUDED.identity_number,company_name=EXCLUDED.company_name,tax_number=EXCLUDED.tax_number,tax_office=EXCLUDED.tax_office,billing_address=EXCLUDED.billing_address,billing_city=EXCLUDED.billing_city,billing_district=EXCLUDED.billing_district,provider_status='DRAFT',failure_reason=NULL,updated_at=now() WHERE order_invoices.provider_status IN ('DRAFT','FAILED') RETURNING id`,[orderId,dto.customerType,dto.recipientName.trim(),individual?dto.identityNumber: null,individual?null:dto.companyName!.trim(),individual?null:dto.taxNumber!,individual?null:dto.taxOffice?.trim()||null,dto.billingAddress.trim(),dto.billingCity?.trim()||null,dto.billingDistrict?.trim()||null,actor.id]);
      if(!row.rowCount) throw new ConflictException('Paraşüt’e gönderilmiş fatura taslağı değiştirilemez');
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[actor.id,'invoice.parasut.draft_created','order',orderId,JSON.stringify({invoiceId:row.rows[0].id,customerType:dto.customerType})]); return {id:row.rows[0].id,status:'DRAFT'};
    });
  }
  async issueInvoice(orderId: string, actor: RequestUser) {
    const result = await this.db.transaction(async client => {
      const invoice = (await client.query<{
        id: string; customer_type: 'INDIVIDUAL' | 'CORPORATE'; recipient_name: string; identity_number: string | null; company_name: string | null; tax_number: string | null; tax_office: string | null; billing_address: string; billing_city: string | null; billing_district: string | null; provider_status: string;
      }>('SELECT * FROM order_invoices WHERE order_id=$1 FOR UPDATE', [orderId])).rows[0];
      if (!invoice) throw new NotFoundException('Önce fatura taslağını kaydedin');
      if (invoice.provider_status === 'ISSUED') throw new ConflictException('Bu fatura zaten Paraşüt’e gönderildi');
      const order = (await client.query<{ order_number: string; created_at: string; customer_email: string | null }>(`SELECT o.order_number,o.created_at,COALESCE(c.email,cs.contact_email) AS customer_email FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN checkout_sessions cs ON cs.id=o.checkout_id WHERE o.id=$1`, [orderId])).rows[0];
      if (!order) throw new NotFoundException('Sipariş bulunamadı');
      const lines = (await client.query<{ product_name: string; quantity: number; unit_amount: string }>('SELECT product_name,quantity,unit_amount FROM order_items WHERE order_id=$1 ORDER BY id', [orderId])).rows;
      if (!lines.length) throw new BadRequestException('Sipariş kalemi bulunamadı');
      await client.query("UPDATE order_invoices SET provider_status='PENDING_PROVIDER',failure_reason=NULL,updated_at=now() WHERE id=$1", [invoice.id]);
      return { invoice, order, lines };
    });
    try {
      const sent = await this.parasut!.issue({ customerType: result.invoice.customer_type, recipientName: result.invoice.recipient_name, identityNumber: result.invoice.identity_number, companyName: result.invoice.company_name, taxNumber: result.invoice.tax_number, taxOffice: result.invoice.tax_office, billingAddress: result.invoice.billing_address, billingCity: result.invoice.billing_city, billingDistrict: result.invoice.billing_district, email: result.order.customer_email, orderNumber: result.order.order_number, issueDate: new Date(result.order.created_at).toISOString().slice(0, 10), lines: result.lines.map(line => ({ description: line.product_name, quantity: Number(line.quantity), unitPrice: Number(line.unit_amount) })) });
      await this.db.query("UPDATE order_invoices SET provider_status='ISSUED',provider_invoice_id=$2,invoice_number=$3,provider_payload=$4,updated_at=now() WHERE order_id=$1", [orderId, sent.providerInvoiceId, sent.invoiceNumber, JSON.stringify(sent.payload)]);
      await this.db.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [actor.id, 'invoice.parasut.issued', 'order', orderId, JSON.stringify({ providerInvoiceId: sent.providerInvoiceId })]);
      return this.invoice(orderId);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'Bilinmeyen Paraşüt hatası';
      await this.db.query("UPDATE order_invoices SET provider_status='FAILED',failure_reason=$2,updated_at=now() WHERE order_id=$1", [orderId, message]);
      throw error;
    }
  }
  async reportSummary(days=30) { const span=Math.min(Math.max(Number.isFinite(days)?Math.floor(days):30,1),365); const [totals,statuses,channels,daily,topProducts,financial]=await Promise.all([this.db.query(`SELECT count(*)::int order_count,COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('CANCELLED')),0)::text revenue,COALESCE(AVG(total_amount) FILTER (WHERE status NOT IN ('CANCELLED')),0)::text average_order FROM orders WHERE created_at>=now()-($1::int*interval '1 day')`,[span]),this.db.query(`SELECT status,count(*)::int count,COALESCE(SUM(total_amount),0)::text amount FROM orders WHERE created_at>=now()-($1::int*interval '1 day') GROUP BY status ORDER BY count DESC`,[span]),this.db.query(`SELECT sales_channel,count(*)::int count,COALESCE(SUM(total_amount),0)::text amount FROM orders WHERE created_at>=now()-($1::int*interval '1 day') GROUP BY sales_channel ORDER BY amount DESC`,[span]),this.db.query(`SELECT to_char(day,'DD Mon') label,COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('CANCELLED')),0)::text amount,COALESCE(count(o.id),0)::int count FROM generate_series(current_date-($1::int-1),current_date,interval '1 day') day LEFT JOIN orders o ON o.created_at>=day AND o.created_at<day+interval '1 day' GROUP BY day ORDER BY day`,[span]),this.db.query(`SELECT oi.product_name AS label,COALESCE(SUM(oi.quantity),0)::int count,COALESCE(SUM(oi.quantity*oi.unit_amount),0)::text amount FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status<>'CANCELLED' AND o.created_at>=now()-($1::int*interval '1 day') GROUP BY oi.product_name ORDER BY count DESC,amount DESC LIMIT 10`,[span]),this.db.query(`SELECT COALESCE(SUM(amount) FILTER (WHERE kind IN ('INCOME','COLLECTION','TRANSFER_IN')),0)::text income,COALESCE(SUM(amount) FILTER (WHERE kind IN ('EXPENSE','REFUND','COMMISSION','PRIME_EXPENSE','TRANSFER_OUT')),0)::text expense FROM finance_transactions WHERE occurred_at>=now()-($1::int*interval '1 day')`,[span])]); const income=Number(financial.rows[0]?.income??0),expense=Number(financial.rows[0]?.expense??0); return {days:span,totals:totals.rows[0],financial:{income:String(income),expense:String(expense),net:String(income-expense)},statuses:statuses.rows,channels:channels.rows,daily:daily.rows,topProducts:topProducts.rows}; }
  async operationalSummary(days=30) { const span=Math.min(Math.max(Number.isFinite(days)?Math.floor(days):30,1),365); return (await this.db.query(`SELECT
    (SELECT count(*)::int FROM returns WHERE status NOT IN ('REFUNDED','REJECTED','CANCELLED') AND requested_at>=now()-($1::int*interval '1 day')) AS returns_open,
    (SELECT count(*)::int FROM returns WHERE status='REFUNDED' AND completed_at>=now()-($1::int*interval '1 day')) AS returns_refunded,
    (SELECT count(*)::int FROM shipments WHERE status IN ('CREATED','IN_TRANSIT') AND created_at>=now()-($1::int*interval '1 day')) AS shipments_active,
    (SELECT count(*)::int FROM shipments WHERE status='FAILED' AND updated_at>=now()-($1::int*interval '1 day')) AS shipments_failed,
    (SELECT count(*)::int FROM support_tickets WHERE status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER') AND due_at<now()) AS support_overdue`,[span])).rows[0]; }
  async detail(id:string) {
    const result=await this.db.query<{contact_name:string|null;contact_email:string|null}>(`SELECT o.id,o.order_number,o.status,o.sales_channel,o.total_amount,o.currency,o.created_at,COALESCE(c.email,cs.contact_email) AS customer_email,cs.contact_email,cs.contact_name,
      (o.sales_channel IN ('ADMIN_ORDER','RETAIL','WHOLESALE','PUBLIC_WEB','INSTAGRAM','MARKETPLACE') AND o.status IN ('PENDING_PAYMENT','PROCESSING')
      AND EXISTS(SELECT 1 FROM payments p WHERE p.checkout_id=o.checkout_id AND p.status='PENDING')
      AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.checkout_id=o.checkout_id AND p.status<>'PENDING')
      AND NOT EXISTS(SELECT 1 FROM finance_transactions t WHERE t.order_id=o.id AND t.approved_at IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM picking_sessions ps WHERE ps.order_id=o.id AND ps.status<>'OPEN')
      AND NOT EXISTS(SELECT 1 FROM packing_sessions pk JOIN picking_sessions ps ON ps.id=pk.picking_session_id WHERE ps.order_id=o.id)) AS financial_editable
      FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN checkout_sessions cs ON cs.id=o.checkout_id WHERE o.id=$1`,[id]);
    if(!result.rows[0]) throw new NotFoundException('Sipariş bulunamadı');
    const [address,items,payments,supportTickets,shipments,returns,activity,fulfillment]=await Promise.all([
      this.db.query<{recipient_name:string;phone:string;city:string;district:string;address_line:string;postal_code:string|null}>('SELECT recipient_name,phone,city,district,address_line,postal_code FROM order_addresses WHERE order_id=$1',[id]),
      this.db.query<{id:string;quantity:number;unit_amount:string}>('SELECT id,product_name,sku,quantity,unit_amount,currency FROM order_items WHERE order_id=$1 ORDER BY id',[id]),
      this.db.query('SELECT p.id,p.provider,p.status,p.amount,p.currency,p.created_at,p.verified_at FROM payments p JOIN orders o ON o.checkout_id=p.checkout_id WHERE o.id=$1 ORDER BY p.created_at DESC',[id]),
      this.db.query('SELECT id,ticket_number,subject,status,priority,created_at FROM support_tickets WHERE order_id=$1 ORDER BY created_at DESC',[id]),
      this.db.query(`SELECT s.id,s.status,s.tracking_number,s.provider,s.created_at,pk.package_barcode,
        se.description AS last_event_description,se.occurred_at AS last_event_at
        FROM shipments s
        LEFT JOIN LATERAL (
          SELECT pk.package_barcode FROM packing_sessions pk
          JOIN picking_sessions ps ON ps.id=pk.picking_session_id
          WHERE ps.order_id=s.order_id ORDER BY pk.packed_at DESC NULLS LAST LIMIT 1
        ) pk ON true
        LEFT JOIN LATERAL (
          SELECT description,occurred_at FROM shipment_events
          WHERE shipment_id=s.id ORDER BY occurred_at DESC LIMIT 1
        ) se ON true
        WHERE s.order_id=$1 ORDER BY s.created_at DESC`,[id]),
      this.db.query(`SELECT id,status,reason,requested_at,completed_at
        FROM returns WHERE order_id=$1 ORDER BY requested_at DESC`,[id]),
      this.db.query(`SELECT a.action,a.created_at,u.email AS actor_email
        FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
        WHERE a.entity_type='order' AND a.entity_id=$1 ORDER BY a.created_at DESC LIMIT 100`,[id]),
      this.db.query(`SELECT ps.id AS picking_id,ps.status AS picking_status,ps.created_at AS picking_started_at,ps.completed_at AS picking_completed_at,
        pk.packed_at,pk.package_barcode,s.status AS shipment_status,s.tracking_number
        FROM picking_sessions ps
        LEFT JOIN packing_sessions pk ON pk.picking_session_id=ps.id
        LEFT JOIN shipments s ON s.order_id=ps.order_id
        WHERE ps.order_id=$1 ORDER BY ps.created_at DESC,s.created_at DESC LIMIT 1`,[id]),
    ]);
    return {...result.rows[0],address:address.rows[0]??null,items:items.rows,payments:payments.rows,supportTickets:supportTickets.rows,shipments:shipments.rows,returns:returns.rows,activity:activity.rows,fulfillment:fulfillment.rows[0]??null,edit_version:editVersion(result.rows[0],address.rows[0]??null,items.rows)};
  }
  async track(number:string,email:string) { const result=await this.db.query<{order_number:string;status:string;total_amount:string;currency:string;created_at:string;shipment_status:string|null;tracking_number:string|null}>(`SELECT o.order_number,o.status,o.total_amount,o.currency,o.created_at,s.status AS shipment_status,s.tracking_number FROM orders o JOIN checkout_sessions cs ON cs.id=o.checkout_id LEFT JOIN shipments s ON s.order_id=o.id WHERE o.order_number=$1 AND lower(cs.contact_email)=lower($2)`,[number.trim(),email.trim()]); if(!result.rows[0]) throw new NotFoundException('Sipariş bulunamadı'); return result.rows[0]; }
  async cancel(id:string,actor:RequestUser) {
    if(!['ADMIN','SUPER_ADMIN','DEALER'].includes(actor.role)) throw new ForbiddenException('Sipariş iptali için yönetici yetkisi gerekli');
    return this.db.transaction(async client=>{
      const order=(await client.query<{checkout_id:string;status:string;sales_channel:string}>('SELECT checkout_id,status,sales_channel FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!order) throw new NotFoundException('Sipariş bulunamadı');
      if(order.status==='CANCELLED') return {id,status:'CANCELLED',replayed:true};
      if(order.sales_channel!=='ADMIN_ORDER'||!['PENDING_PAYMENT','PROCESSING'].includes(order.status)) throw new ConflictException('Bu sipariş güvenli iptal kapsamı dışında; iade akışını kullanın');
      await client.query('SELECT id FROM checkout_sessions WHERE id=$1 FOR UPDATE',[order.checkout_id]);
      const payment=(await client.query<{id:string;status:string;provider:string}>('SELECT id,status,provider FROM payments WHERE checkout_id=$1 FOR UPDATE',[order.checkout_id])).rows[0];
      if(!payment||payment.status!=='PENDING'||!['bank_transfer','cash','cash_on_delivery_card','cash_on_delivery_cash'].includes(payment.provider)) throw new ConflictException('Tahsil edilmiş sipariş için iade işlemi gerekli');
      const collected=await client.query('SELECT id FROM finance_transactions WHERE order_id=$1 AND approved_at IS NOT NULL LIMIT 1',[id]);
      if(collected.rowCount) throw new ConflictException('Kısmi tahsilat yapılmış sipariş için iade işlemi gerekli');
      await client.query('SELECT id FROM picking_sessions WHERE order_id=$1 FOR UPDATE',[id]);
      const packed=await client.query('SELECT pk.id FROM packing_sessions pk JOIN picking_sessions ps ON ps.id=pk.picking_session_id WHERE ps.order_id=$1 AND pk.packed_at IS NOT NULL LIMIT 1',[id]);
      if(packed.rowCount) throw new ConflictException('Paketlenmiş sipariş için iade işlemi gerekli');
      const reservations=(await client.query<{id:string;product_id:string;warehouse_id:string;quantity:number}>(
        "SELECT id,product_id,warehouse_id,quantity FROM stock_reservations WHERE reference_type='checkout' AND reference_id=$1 AND status='ACTIVE' ORDER BY product_id,warehouse_id,id FOR UPDATE",[order.checkout_id])).rows;
      let releasedQuantity=0;
      for(const reservation of reservations) {
        const stock=await client.query('UPDATE inventory SET reserved_quantity=reserved_quantity-$1,updated_at=now() WHERE product_id=$2 AND warehouse_id=$3 AND reserved_quantity>=$1 RETURNING product_id',[reservation.quantity,reservation.product_id,reservation.warehouse_id]);
        if(!stock.rowCount) throw new ConflictException('Ayrılan stok doğrulanamadı; iptal uygulanmadı');
        await client.query("UPDATE stock_reservations SET status='RELEASED',released_at=now() WHERE id=$1",[reservation.id]);
        await client.query("INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,created_by) VALUES ($1,$2,'RELEASE',0,'order_cancel',$3,$4)",[reservation.product_id,reservation.warehouse_id,id,actor.id]);
        releasedQuantity+=reservation.quantity;
      }
      await client.query("UPDATE picking_sessions SET status='CANCELLED' WHERE order_id=$1 AND status IN ('OPEN','IN_PROGRESS','COMPLETED')",[id]);
      await client.query("UPDATE payments SET status='FAILED' WHERE id=$1",[payment.id]);
      await client.query("UPDATE payment_attempts SET status='FAILED' WHERE payment_id=$1",[payment.id]);
      await client.query("UPDATE checkout_sessions SET status='EXPIRED' WHERE id=$1",[order.checkout_id]);
      await client.query("UPDATE orders SET status='CANCELLED' WHERE id=$1",[id]);
      await client.query("INSERT INTO order_status_history(order_id,status,actor_user_id) VALUES ($1,'CANCELLED',$2)",[id,actor.id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[actor.id,'order.cancelled','order',id,JSON.stringify({previousStatus:order.status,releasedQuantity})]);
      return {id,status:'CANCELLED',releasedQuantity,replayed:false};
    });
  }
  async updateStatus(id:string,dto:UpdateOrderStatusDto,actor:RequestUser) {
    if(dto.status==='CANCELLED') return this.cancel(id,actor);
    if(!['SUPER_ADMIN','ADMIN','WAREHOUSE'].includes(actor.role)) throw new ForbiddenException('Sipariş operasyonu yetkisi gerekli');
    const result = await this.db.transaction(async client=>{
      const order=(await client.query<{status:string;order_number:string;contact_email:string|null}>('SELECT o.status,o.order_number,cs.contact_email FROM orders o LEFT JOIN checkout_sessions cs ON cs.id=o.checkout_id WHERE o.id=$1 FOR UPDATE',[id])).rows[0];
      if(!order) throw new NotFoundException('Sipariş bulunamadı');
      if(order.status===dto.status) return {id,status:dto.status,replayed:true,orderNumber:order.order_number,recipient:order.contact_email};
      const next:Record<string,string>={PROCESSING:'SHIPPED',SHIPPED:'DELIVERED'};
      if(next[order.status]!==dto.status) throw new ConflictException('Bu sipariş durum geçişine izin verilmiyor');
      await client.query('UPDATE orders SET status=$1 WHERE id=$2',[dto.status,id]);
      await client.query('INSERT INTO order_status_history(order_id,status,actor_user_id) VALUES ($1,$2,$3)',[id,dto.status,actor.id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)',[actor.id,`order.status.${dto.status.toLowerCase()}`,'order',id]);
      if(dto.status==='DELIVERED') await this.commissions?.awardForDeliveredOrder(id,actor.id,client);
      return {id,status:dto.status,replayed:false,orderNumber:order.order_number,recipient:order.contact_email};
    });
    if (result.status === 'DELIVERED') {
      const dealer = await this.db.query<{ dealer_id: string }>("SELECT dua.dealer_id FROM audit_logs al JOIN dealer_user_accounts dua ON dua.user_id=al.actor_user_id WHERE al.entity_type='order' AND al.entity_id=$1 AND al.action IN ('order.dealer.created','order.admin.created') ORDER BY al.created_at ASC LIMIT 1", [id]);
      if (dealer.rowCount) {
        const items = await this.db.query<{ id: string; product_id: string; quantity: number }>('SELECT id,product_id,quantity FROM order_items WHERE order_id=$1 ORDER BY id', [id]);
        for (const item of items.rows) await this.commissions?.confirmForOrderItem({ dealerId: dealer.rows[0].dealer_id, orderId: id, orderItemId: item.id, productId: item.product_id, quantity: item.quantity });
      }
    }
    if (!result.replayed && (result.status === 'SHIPPED' || result.status === 'DELIVERED')) await this.notifications?.recordOrderStatus(result.recipient, result.orderNumber, result.status);
    return {id,status:result.status};
  }
}
