import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { OrdersService } from './orders.service';
import { RequestUser } from '../auth/auth.types';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CreateAdminOrderDto } from './dto/create-admin-order.dto';
import { AdminOrderService } from './admin-order.service';
import { UpdateAdminOrderPricesDto } from './dto/update-admin-order-prices.dto';
import { UpdateAdminOrderDto } from './dto/update-admin-order.dto';
import { CreateInvoiceDraftDto } from './dto/create-invoice-draft.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';

type UserRequest=Request & {user:RequestUser};@Controller('admin/orders') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE, Roles.WAREHOUSE)
class UpdateOrderNoteDto { @IsOptional() @IsString() @MaxLength(1000) note?: string; }
export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly adminOrders: AdminOrderService) {}
  @Get() list(@Query('channel') channel?:string) { return this.orders.list(channel); }
  @Get('report-summary') @RequireRoles(Roles.SUPER_ADMIN)
  reportSummary(@Query('days') days?:string) { return this.orders.reportSummary(Number(days ?? 30)); }
  @Get('report-operations') @RequireRoles(Roles.SUPER_ADMIN)
  reportOperations(@Query('days') days?:string) { return this.orders.operationalSummary(Number(days ?? 30)); }
  @Get('sales-report') @RequireRoles(Roles.SUPER_ADMIN)
  salesReport(@Query('dateFrom') dateFrom?:string,@Query('dateTo') dateTo?:string,@Query('channel') channel?:string) { return this.orders.salesReport(dateFrom,dateTo,channel); }
  @Get('special-report') @RequireRoles(Roles.SUPER_ADMIN)
  specialReport(@Query('dateFrom') dateFrom?:string,@Query('dateTo') dateTo?:string) { return this.orders.specialReport(dateFrom,dateTo); }
  @Get('creation-options') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  options(@Query('channel') channel?: string) { return this.adminOrders.options(undefined, channel); }
  @Get('notes') listNotes() { return this.orders.listNotes(); }
  @Post() @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  create(@Body() dto: CreateAdminOrderDto, @Headers('idempotency-key') key: string, @Req() req: UserRequest) { return this.adminOrders.create(dto,key,req.user); }
  @Get(':id') detail(@Param('id',new ParseUUIDPipe()) id:string) { return this.orders.detail(id); }
  @Get(':id/invoice') @RequireRoles(Roles.SUPER_ADMIN) invoice(@Param('id',new ParseUUIDPipe()) id:string) { return this.orders.invoice(id); }
  @Post(':id/invoice') @RequireRoles(Roles.SUPER_ADMIN) invoiceDraft(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:CreateInvoiceDraftDto,@Req() req:UserRequest) { return this.orders.createInvoiceDraft(id,dto,req.user); }
  @Post(':id/invoice/issue') @RequireRoles(Roles.SUPER_ADMIN) invoiceIssue(@Param('id',new ParseUUIDPipe()) id:string,@Req() req:UserRequest) { return this.orders.issueInvoice(id,req.user); }
  @Patch(':id/prices') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  prices(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateAdminOrderPricesDto,@Req() req:UserRequest) { return this.adminOrders.updatePrices(id,dto,req.user); }
  @Patch(':id') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  edit(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateAdminOrderDto,@Req() req:UserRequest) { return this.adminOrders.update(id,dto,req.user); }
  @Patch(':id/note') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  note(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateOrderNoteDto,@Req() req:UserRequest) { return this.orders.updateNote(id,dto.note,req.user.id); }
  @Patch(':id/status') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE)
  update(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateOrderStatusDto,@Req() req:UserRequest) { return this.orders.updateStatus(id,dto,req.user); }
  @Post(':id/cancel') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  cancel(@Param('id',new ParseUUIDPipe()) id:string,@Req() req:UserRequest) { return this.orders.cancel(id,req.user); }
}
