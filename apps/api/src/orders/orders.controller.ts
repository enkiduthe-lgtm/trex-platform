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

type UserRequest=Request & {user:RequestUser};@Controller('admin/orders') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE, Roles.WAREHOUSE)
export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly adminOrders: AdminOrderService) {}
  @Get() list(@Query('channel') channel?:string) { return this.orders.list(channel); }
  @Get('creation-options') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  options() { return this.adminOrders.options(); }
  @Post() @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  create(@Body() dto: CreateAdminOrderDto, @Headers('idempotency-key') key: string, @Req() req: UserRequest) { return this.adminOrders.create(dto,key,req.user); }
  @Get(':id') detail(@Param('id',new ParseUUIDPipe()) id:string) { return this.orders.detail(id); }
  @Patch(':id/prices') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  prices(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateAdminOrderPricesDto,@Req() req:UserRequest) { return this.adminOrders.updatePrices(id,dto,req.user); }
  @Patch(':id') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  edit(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateAdminOrderDto,@Req() req:UserRequest) { return this.adminOrders.update(id,dto,req.user); }
  @Patch(':id/status') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE)
  update(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateOrderStatusDto,@Req() req:UserRequest) { return this.orders.updateStatus(id,dto,req.user); }
  @Post(':id/cancel') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  cancel(@Param('id',new ParseUUIDPipe()) id:string,@Req() req:UserRequest) { return this.orders.cancel(id,req.user); }
}
