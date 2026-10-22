import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/auth.types';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { CreateFinanceRecordDto } from './dto/create-finance-record.dto';
import { FinanceService } from './finance.service';
import { CreateFinanceAccountDto } from './dto/create-finance-account.dto';
import { CreateFinanceTransactionDto, CreateFinanceTransferDto } from './dto/create-finance-transaction.dto';
import { ApproveCollectionDto } from './dto/approve-collection.dto';
import { CreateMarketplaceSettlementDto } from './dto/create-marketplace-settlement.dto';
import { UpdatePaytrSettingsDto } from './dto/update-paytr-settings.dto';
import { CreateFinanceBudgetDto } from './dto/create-finance-budget.dto';
type UserRequest = Request & { user: RequestUser };
@Controller('admin/finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(Roles.SUPER_ADMIN)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('paytr') paytr() { return this.finance.paytrCash(); }
  @Post('paytr/settings') paytrSettings(@Body() dto: UpdatePaytrSettingsDto, @Req() req: UserRequest) { return this.finance.updatePaytrRate(dto.commissionRate, req.user); }
  @Get('records') list() { return this.finance.list(); }
  @Post('records') create(@Body() dto: CreateFinanceRecordDto, @Req() req: UserRequest) { return this.finance.create(dto, req.user); }
  @Get('accounts') accounts() { return this.finance.listAccounts(); }
  @Post('accounts') account(@Body() dto: CreateFinanceAccountDto, @Req() req: UserRequest) { return this.finance.createAccount(dto, req.user); }
  @Patch('accounts/:id') updateAccount(@Param('id') id:string,@Body() dto: CreateFinanceAccountDto,@Req() req:UserRequest) { return this.finance.updateAccount(id,dto,req.user); }
  @Delete('accounts/:id') archiveAccount(@Param('id') id:string,@Req() req:UserRequest) { return this.finance.archiveAccount(id,req.user); }
  @Get('transactions') transactions() { return this.finance.listTransactions(); }

  // Yönetici yalnızca bekleyen havaleyi görüp siparişle eşleştirebilir.
  @Get('pending-collections') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  pendingCollections() { return this.finance.pendingCollections(); }
  @Post('collections/:id/approve') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  approve(@Param('id') id: string, @Body() dto: ApproveCollectionDto, @Req() req: UserRequest) { return this.finance.approveCollection(id, dto, req.user); }

  @Get('marketplace-settlements') marketplaceSettlements() { return this.finance.listMarketplaceSettlements(); }
  @Get('dashboard') dashboard() { return this.finance.dashboard(); }
  @Get('alerts') alerts() { return this.finance.alerts(); }
  @Get('budgets') budgets(@Query('period') period?: string) { return this.finance.budgets(period); }
  @Get('cash-flow') cashFlow() { return this.finance.cashFlowProjection(); }
  @Post('budgets') budget(@Body() dto: CreateFinanceBudgetDto, @Req() req: UserRequest) { return this.finance.createBudget(dto, req.user); }
  @Post('transactions') transaction(@Body() dto: CreateFinanceTransactionDto, @Req() req: UserRequest) { return this.finance.createTransaction(dto, req.user); }
  @Patch('transactions/:id') updateTransaction(@Param('id') id:string,@Body() dto: CreateFinanceTransactionDto,@Req() req:UserRequest) { return this.finance.updateTransaction(id,dto,req.user); }
  @Delete('transactions/:id') deleteTransaction(@Param('id') id:string,@Req() req:UserRequest) { return this.finance.deleteTransaction(id,req.user); }
  @Post('marketplace-settlements') marketplaceSettlement(@Body() dto: CreateMarketplaceSettlementDto, @Req() req: UserRequest) { return this.finance.createMarketplaceSettlement(dto, req.user); }
  @Post('transfers') transfer(@Body() dto: CreateFinanceTransferDto, @Req() req: UserRequest) { return this.finance.createTransfer(dto, req.user); }
}
