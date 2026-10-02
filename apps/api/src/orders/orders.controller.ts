import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { OrdersService } from './orders.service';
import { RequestUser } from '../auth/auth.types';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

type UserRequest=Request & {user:RequestUser};@Controller('admin/orders') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE, Roles.WAREHOUSE)
export class OrdersController { constructor(private readonly orders: OrdersService) {} @Get() list(@Query('channel') channel?:string) { return this.orders.list(channel); } @Patch(':id/status') update(@Param('id')id:string,@Body()dto:UpdateOrderStatusDto,@Req()req:UserRequest){return this.orders.updateStatus(id,dto,req.user);} }
