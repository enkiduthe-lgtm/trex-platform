import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RequestUser } from '../auth/auth.types';
import { SettingsService } from './settings.service';
class UpdateSettingsDto { @IsObject() settings!: Record<string, unknown>; }
type UserRequest = Request & { user: RequestUser };
@Controller('admin/settings') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}
  @Get('manager-menu') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  managerMenu() { return this.settings.managerMenu(); }
  @Get() get() { return this.settings.get(); }
  @Put() update(@Body() dto: UpdateSettingsDto, @Req() req: UserRequest) { return this.settings.update(dto.settings, req.user); }
}
