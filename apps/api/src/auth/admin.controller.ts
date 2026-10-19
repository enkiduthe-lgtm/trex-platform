import { BadRequestException, Body, ConflictException, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import * as argon2 from 'argon2';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequireRoles } from './roles.decorator';
import { Roles } from './roles';
import { RolesGuard } from './roles.guard';
import { DatabaseService } from '../database/database.service';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UpdateStaffUserDto } from './dto/update-staff-user.dto';
import { ResetStaffPasswordDto } from './dto/reset-staff-password.dto';
import { ChangeStaffRoleDto } from './dto/change-staff-role.dto';
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
  @Patch('staff/:id/role') @RequireRoles(Roles.SUPER_ADMIN) async changeStaffRole(@Param('id') id: string, @Body() dto: ChangeStaffRoleDto, @Req() req: UserRequest) {
    if (id === req.user.id) throw new ConflictException('Kendi yetkinizi bu ekrandan değiştiremezsiniz');
    return this.db.transaction(async client => {
      const changed = await client.query<{ id: string; role: string }>('UPDATE users SET role=$1,updated_at=now() WHERE id=$2 AND role IN (\'ADMIN\',\'WAREHOUSE\',\'FINANCE\') RETURNING id,role', [dto.role, id]);
      if (!changed.rowCount) throw new ConflictException('Personel hesabı bulunamadı');
      await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'staff.role.changed', 'user', id, JSON.stringify({ role: dto.role })]);
      return changed.rows[0];
    });
  }
  @Post('staff/:id/reset-password') @RequireRoles(Roles.SUPER_ADMIN) async resetStaffPassword(@Param('id') id: string, @Body() dto: ResetStaffPasswordDto, @Req() req: UserRequest) {
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    return this.db.transaction(async client => {
      const changed = await client.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2 AND role IN (\'ADMIN\',\'WAREHOUSE\',\'FINANCE\') RETURNING id', [passwordHash, id]);
      if (!changed.rowCount) throw new ConflictException('Personel hesabı bulunamadı');
      await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [req.user.id, 'staff.password.reset', 'user', id]);
      return changed.rows[0];
    });
  }
  @Post('dealers/:id/portal-account') @RequireRoles(Roles.SUPER_ADMIN) async createDealerPortalAccount(@Param('id') dealerId: string, @Body() dto: { email: string; password: string }, @Req() req: UserRequest) {
    const email = dto.email?.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !dto.password || dto.password.length < 12) throw new BadRequestException('Geçerli e-posta ve en az 12 karakterlik ilk şifre gereklidir');
    try {
      const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
      return await this.db.transaction(async client => {
        const dealer = await client.query('SELECT id FROM dealers WHERE id=$1 AND status=\'ACTIVE\' FOR UPDATE', [dealerId]);
        if (!dealer.rowCount) throw new ConflictException('Önce aktif bayi onayı verilmelidir');
        const existing = await client.query('SELECT 1 FROM dealer_user_accounts WHERE dealer_id=$1', [dealerId]);
        if (existing.rowCount) throw new ConflictException('Bu bayi için portal hesabı zaten açılmış');
        const created = await client.query<{ id: string }>('INSERT INTO users(email,password_hash,role) VALUES($1,$2,\'DEALER\') RETURNING id', [email, passwordHash]);
        await client.query('INSERT INTO dealer_user_accounts(dealer_id,user_id) VALUES($1,$2)', [dealerId, created.rows[0].id]);
        await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [req.user.id, 'dealer.portal_account.created', 'dealer', dealerId, JSON.stringify({ email })]);
        return { id: created.rows[0].id, email };
      });
    } catch (error: unknown) { if ((error as { code?: string }).code === '23505') throw new ConflictException('Bu e-posta ile bir hesap zaten var'); throw error; }
  }
}
