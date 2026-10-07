import { Body, ConflictException, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import * as argon2 from 'argon2';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequireRoles } from './roles.decorator';
import { Roles } from './roles';
import { RolesGuard } from './roles.guard';
import { DatabaseService } from '../database/database.service';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UpdateStaffUserDto } from './dto/update-staff-user.dto';
import { RequestUser } from './auth.types';
type UserRequest = Request & { user: RequestUser };
@Controller('admin') @UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly db: DatabaseService) {}
  @Get('ping') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) ping() { return { status: 'ok' }; }
  @Get('staff') @RequireRoles(Roles.SUPER_ADMIN) async staff() { return (await this.db.query('SELECT id,email,role,is_active,created_at FROM users WHERE role IN (\'ADMIN\',\'WAREHOUSE\',\'FINANCE\') ORDER BY created_at DESC')).rows; }
  @Post('staff') @RequireRoles(Roles.SUPER_ADMIN) async createStaff(@Body() dto: CreateStaffUserDto, @Req() req: UserRequest) {
    try {
      const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
      return await this.db.transaction(async client => {
        const created = await client.query<{ id: string }>('INSERT INTO users(email,password_hash,role) VALUES ($1,$2,$3) RETURNING id', [dto.email.trim().toLowerCase(), passwordHash, dto.role]);
        await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [req.user.id, 'staff.created', 'user', created.rows[0].id]);
        return created.rows[0];
      });
    } catch (error: unknown) { if ((error as { code?: string }).code === '23505') throw new ConflictException('Bu e-posta ile bir hesap zaten var'); throw error; }
  }
  @Patch('staff/:id') @RequireRoles(Roles.SUPER_ADMIN) async updateStaff(@Param('id') id: string, @Body() dto: UpdateStaffUserDto, @Req() req: UserRequest) {
    return this.db.transaction(async client => {
      const changed = await client.query('UPDATE users SET is_active=$1,updated_at=now() WHERE id=$2 AND role IN (\'ADMIN\',\'WAREHOUSE\',\'FINANCE\') RETURNING id', [dto.isActive, id]);
      if (!changed.rowCount) throw new ConflictException('Personel hesabı bulunamadı');
      if (!dto.isActive) await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [req.user.id, dto.isActive ? 'staff.activated' : 'staff.deactivated', 'user', id]);
      return changed.rows[0];
    });
  }
}
