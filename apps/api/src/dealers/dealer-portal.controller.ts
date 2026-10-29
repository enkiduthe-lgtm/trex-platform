import { Body, ConflictException, Controller, Get, Headers, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RequestUser } from '../auth/auth.types';
import { OrdersService } from '../orders/orders.service';
import { AdminOrderService } from '../orders/admin-order.service';
import { CreateAdminOrderDto } from '../orders/dto/create-admin-order.dto';
import { dealerWallet } from '../commissions/dealer-wallet';

type UserRequest = Request & { user: RequestUser };

@Controller('dealer-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(Roles.DEALER)
export class DealerPortalController {
  constructor(private readonly db: DatabaseService, private readonly orders: OrdersService, private readonly adminOrders: AdminOrderService) {}

  @Get('summary')
  async summary(@Req() req: UserRequest) {
    const result = await this.db.query<{ company_name: string; code: string; status: string; dealer_balance: string; available_commission: string; order_count: string; agreement_accepted_at: string | null; has_primary_iban: boolean }>("SELECT d.company_name,d.code,d.status,dua.agreement_accepted_at,EXISTS(SELECT 1 FROM dealer_bank_accounts b WHERE b.dealer_id=d.id AND b.is_primary=true) AS has_primary_iban,COALESCE((SELECT SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END) FROM dealer_ledger_entries WHERE dealer_id=d.id AND currency='TRY'),0)::text AS dealer_balance,COALESCE((SELECT SUM(amount) FROM commission_entries WHERE dealer_id=d.id AND status IN ('CONFIRMED','AVAILABLE')),0)::text AS available_commission,(SELECT count(DISTINCT al.entity_id) FROM audit_logs al WHERE al.actor_user_id=$1 AND al.action IN ('order.dealer.created','order.admin.created') AND al.entity_type='order')::text AS order_count FROM dealer_user_accounts dua JOIN dealers d ON d.id=dua.dealer_id WHERE dua.user_id=$1", [req.user.id]);
    if (!result.rowCount) throw new NotFoundException('Bayi hesabı bulunamadı');
    return result.rows[0];
  }

  @Get('orders')
  async listOrders(@Req() req: UserRequest) {
    const result = await this.db.query("SELECT o.id,o.order_number,o.status,o.total_amount,o.currency,o.created_at,COALESCE((SELECT max(h.created_at) FROM order_status_history h WHERE h.order_id=o.id),o.created_at) AS status_updated_at FROM orders o WHERE EXISTS (SELECT 1 FROM audit_logs al WHERE al.entity_id=o.id AND al.actor_user_id=$1 AND al.action IN ('order.dealer.created','order.admin.created') AND al.entity_type='order') ORDER BY o.created_at DESC", [req.user.id]);
    return result.rows;
  }

  @Get('commissions')
  async commissions(@Req() req: UserRequest) {
    const result = await this.db.query("SELECT e.id,e.amount,e.currency,e.status,e.entry_kind,e.created_at,e.available_at,e.reversed_at,e.note,o.order_number FROM dealer_user_accounts dua JOIN commission_entries e ON e.dealer_id=dua.dealer_id JOIN orders o ON o.id=e.order_id WHERE dua.user_id=$1 ORDER BY e.created_at DESC LIMIT 100", [req.user.id]);
    return result.rows;
  }

  @Get('orders/:id')
  async orderDetail(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: UserRequest) {
    const order = await this.db.query(`SELECT o.id,o.order_number,o.status,o.total_amount,o.currency,o.created_at
      FROM orders o WHERE o.id=$2 AND EXISTS (SELECT 1 FROM audit_logs al WHERE al.entity_id=o.id
        AND al.entity_type='order' AND al.actor_user_id=$1 AND al.action IN ('order.dealer.created','order.admin.created'))`, [req.user.id,id]);
    if (!order.rowCount) throw new NotFoundException('Sipariş Bulunamadı');
    const [items,address] = await Promise.all([
      this.db.query('SELECT id,product_name,sku,quantity,unit_amount,(quantity*unit_amount)::text AS line_total FROM order_items WHERE order_id=$1 ORDER BY id', [id]),
      this.db.query('SELECT recipient_name,phone,city,district,address_line,postal_code FROM order_addresses WHERE order_id=$1', [id]),
    ]);
    return { ...order.rows[0], items: items.rows, address: address.rows[0] ?? null };
  }

  @Get('ledger')
  async ledger(@Req() req: UserRequest) {
    return (await this.db.query(`SELECT e.id,e.direction,e.amount,e.currency,e.description,e.reference_type,e.created_at
      FROM dealer_user_accounts dua JOIN dealer_ledger_entries e ON e.dealer_id=dua.dealer_id
      WHERE dua.user_id=$1 ORDER BY e.created_at DESC,e.id`, [req.user.id])).rows;
  }

  @Get('commission-balances')
  async commissionBalances(@Req() req: UserRequest) {
    const account=(await this.db.query<{dealer_id:string}>('SELECT dealer_id FROM dealer_user_accounts WHERE user_id=$1',[req.user.id])).rows[0];
    if(!account)throw new NotFoundException('Bayi Hesabı Bulunamadı');
    const currencies=(await this.db.query<{currency:string}>("SELECT DISTINCT currency FROM commission_entries WHERE dealer_id=$1 UNION SELECT 'TRY' ORDER BY currency",[account.dealer_id])).rows;
    return Promise.all(currencies.map(async row=>({currency:row.currency,amount:(await dealerWallet(this.db,account.dealer_id,row.currency)).available})));
  }

  @Get('shipments')
  async shipments(@Req() req: UserRequest) {
    return (await this.db.query(`SELECT s.id,o.order_number,s.provider,s.tracking_number,s.status
      FROM shipments s JOIN orders o ON o.id=s.order_id
      WHERE EXISTS (SELECT 1 FROM audit_logs al WHERE al.entity_id=o.id AND al.entity_type='order'
        AND al.actor_user_id=$1 AND al.action IN ('order.dealer.created','order.admin.created'))
      ORDER BY o.created_at DESC,s.id`, [req.user.id])).rows;
  }

  @Get('creation-options')
  async creationOptions(@Req() req: UserRequest) {
    const account = await this.db.query<{ dealer_id:string }>('SELECT dealer_id FROM dealer_user_accounts WHERE user_id=$1', [req.user.id]);
    if (!account.rowCount) throw new NotFoundException('Bayi hesabı bulunamadı');
    return this.adminOrders.options(account.rows[0].dealer_id);
  }

  @Post('orders')
  async createOrder(@Body() dto: CreateAdminOrderDto, @Headers('idempotency-key') key: string, @Req() req: UserRequest) {
    const account = await this.db.query<{ dealer_id:string }>("SELECT dua.dealer_id FROM dealer_user_accounts dua JOIN dealers d ON d.id=dua.dealer_id WHERE dua.user_id=$1 AND d.status='ACTIVE' AND dua.agreement_accepted_at IS NOT NULL", [req.user.id]);
    if (!account.rowCount) throw new NotFoundException('Bayi hesabı bulunamadı');
    return this.adminOrders.create({ ...dto, salesChannel: 'DEALER_PORTAL', customerId: undefined, priceChangeReason: dto.priceChangeReason?.trim() || 'Bayi portalı fiyatı' }, key, req.user, account.rows[0].dealer_id);
  }

  @Post('agreement/accept')
  async acceptAgreement(@Req() req: UserRequest) {
    const result = await this.db.query("UPDATE dealer_user_accounts dua SET agreement_accepted_at=now() FROM dealers d WHERE dua.dealer_id=d.id AND dua.user_id=$1 AND d.status='ACTIVE' RETURNING dua.dealer_id", [req.user.id]);
    if (!result.rowCount) throw new ConflictException('Sözleşme Onayı İçin Aktif Bir Bayi Hesabı Gereklidir');
    return { accepted: true };
  }

  @Post('orders/:id/cancel')
  async cancelOrder(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: UserRequest) {
    const owned = await this.db.query("SELECT 1 FROM audit_logs WHERE actor_user_id=$1 AND action IN ('order.dealer.created','order.admin.created') AND entity_type='order' AND entity_id=$2", [req.user.id, id]);
    if (!owned.rowCount) throw new NotFoundException('Sipariş bulunamadı');
    return this.orders.cancel(id, req.user);
  }
}
