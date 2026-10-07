import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { RequireRoles } from './roles.decorator';
import { Roles } from './roles';
import { ListAuditDto } from './dto/list-audit.dto';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
export class AuditController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async list(@Query() filter: ListAuditDto) {
    const page = filter.page ?? 1;
    const result = await this.db.query(`
      SELECT a.id,a.action,a.entity_type,a.entity_id,a.created_at,
        CASE WHEN a.actor_user_id IS NULL THEN 'SYSTEM' ELSE u.role::text END AS actor_role,
        a.actor_user_id
      FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
      WHERE ($1::text IS NULL OR a.action=$1)
        AND ($2::text IS NULL OR a.entity_type=$2)
        AND ($3::text IS NULL OR a.entity_id=$3)
      ORDER BY a.created_at DESC,a.id DESC LIMIT 51 OFFSET $4`,
      [filter.action?.trim() || null, filter.entityType?.trim() || null, filter.entityId?.trim() || null, (page - 1) * 50]);
    // Metadata can contain delivery/contact details; never expose it in the summary view.
    return { items: result.rows.slice(0, 50), page, hasMore: page < 2000 && result.rows.length > 50 };
  }
}
