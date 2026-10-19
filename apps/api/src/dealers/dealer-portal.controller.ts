import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RequestUser } from '../auth/auth.types';

type UserRequest = Request & { user: RequestUser };

@Controller('dealer-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(Roles.DEALER)
export class DealerPortalController {
  constructor(private readonly db: DatabaseService) {}

  @Get('summary')
  async summary(@Req() req: UserRequest) {
    const result = await this.db.query<{ company_name: string; code: string; status: string; dealer_balance: string; available_commission: string; order_count: string }>('SELECT d.company_name,d.code,d.status, COALESCE((SELECT SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END) FROM dealer_ledger_entries WHERE dealer_id=d.id AND currency='TRY'),0)::text AS dealer_balance, COALESCE((SELECT SUM(amount) FROM commission_entries WHERE dealer_id=d.id AND status IN ('CONFIRMED','AVAILABLE')),0)::text AS available_commission, (SELECT count(DISTINCT order_id)::text FROM commission_entries WHERE dealer_id=d.id) AS order_count FROM dealer_user_accounts dua JOIN dealers d ON d.id=dua.dealer_id WHERE dua.user_id=$1', [req.user.id]);
    if (!result.rowCount) throw new NotFoundException('Bayi hesabı bulunamadı');
    return result.rows[0];
  }
}
