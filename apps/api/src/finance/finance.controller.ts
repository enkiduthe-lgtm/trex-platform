import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/auth.types';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { CreateFinanceRecordDto } from './dto/create-finance-record.dto';
import { FinanceService } from './finance.service';
type UserRequest = Request & { user: RequestUser };
@Controller('admin/finance') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE)
export class FinanceController { constructor(private readonly finance: FinanceService) {} @Get('records') list() { return this.finance.list(); } @Post('records') create(@Body() dto: CreateFinanceRecordDto, @Req() req: UserRequest) { return this.finance.create(dto, req.user); } }
