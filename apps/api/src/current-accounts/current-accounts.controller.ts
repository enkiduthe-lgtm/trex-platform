import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/auth.types';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentAccountsService } from './current-accounts.service';
import { CreateCurrentAccountEntryDto } from './dto/create-current-account-entry.dto';
type UserRequest = Request & { user: RequestUser };
@Controller('admin/current-accounts') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE)
export class CurrentAccountsController {
  constructor(private readonly accounts: CurrentAccountsService) {}
  @Get() summary() { return this.accounts.summary(); }
  @Get(':partyType/:partyId') detail(@Param('partyType') partyType: 'DEALER' | 'CUSTOMER', @Param('partyId') partyId: string) { return this.accounts.detail(partyType, partyId); }
  @Post('entries') create(@Body() dto: CreateCurrentAccountEntryDto, @Req() req: UserRequest) { return this.accounts.create(dto, req.user); }
}
