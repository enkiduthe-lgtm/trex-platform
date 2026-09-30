import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequireRoles } from './roles.decorator';
import { Roles } from './roles';
import { RolesGuard } from './roles.guard';
@Controller('admin') @UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController { @Get('ping') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) ping() { return { status: 'ok' }; } }
