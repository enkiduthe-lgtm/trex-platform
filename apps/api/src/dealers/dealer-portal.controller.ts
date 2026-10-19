import { Body, Controller, Get, Headers, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
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

type UserRequest = Request & { user: RequestUser };

@Controller('dealer-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(Roles.DEALER)
export class DealerPortalController {
  constructor(private readonly db: DatabaseService, private readonly orders: OrdersService, private readonly adminOrders: AdminOrderService) {}

  @Get('summary')
  async summary(@Req() req: UserRequest) {
    const result = await this.db.query<{ company_name: string; code: string; status: string; dealer_balance: string; available_commission: string; order_count: string }>("SELECT d.company_name,d.code,d.status,COALESCE((SELECT SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END) FROM dealer_ledger_entries WHERE dealer_id=d.id AND currency='TRY'),0)::text AS dealer_balance,COALESCE((SELECT SUM(amount) FROM commission_entries WHERE dealer_id=d.id AND status IN ('CONFIRMED','AVAILABLE')),0)::text AS available_commission,(SELECT count(DISTINCT al.entity_id) FROM audit_logs al WHERE al.actor_user_id=$1 AND al.action='order.admin.created' AND al.entity_type='order')::text AS order_count FROM dealer_user_accounts dua JOIN dealers d ON d.id=dua.dealer_id WHERE dua.user_id=$1", [req.user.id]);
    if (!result.rowCount) throw new NotFoundException('Bayi hesabı bulunamadı');
    return result.rows[0];
  }

  @Get('orders')
  async listOrders(@Req() req: UserRequest) {
    const result = await this.db.query("SELECT o.id,o.order_number,o.status,o.total_amount,o.currency,o.created_at FROM audit_logs al JOIN orders o ON o.id=al.entity_id WHERE al.actor_user_id=$1 AND al.action='order.admin.created' AND al.entity_type='order' ORDER BY o.created_at DESC", [req.user.id]);
    return result.rows;
  }

  @Get('creation-options')
  creationOptions() { return this.adminOrders.options(); }

  @Post('orders')
  createOrder(@Body() dto: CreateAdminOrderDto, @Headers('idempotency-key') key: string, @Req() req: UserRequest) {
    return this.adminOrders.create(dto, key, req.user);
  }

  @Post('orders/:id/cancel')
  async cancelOrder(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: UserRequest) {
    const owned = await this.db.query("SELECT 1 FROM audit_logs WHERE actor_user_id=$1 AND action='order.admin.created' AND entity_type='order' AND entity_id=$2", [req.user.id, id]);
    if (!owned.rowCount) throw new NotFoundException('Sipariş bulunamadı');
    return this.orders.cancel(id, req.user);
  }
}
