import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { CreatePriceDto, SalesChannel } from './dto/create-price.dto';
import { PricingService } from './pricing.service';
type UserRequest = Request & { user: RequestUser };
@Controller()
export class PricingController {
  constructor(private readonly pricing: PricingService) {}
  @Get('products/:id/price') resolve(@Param('id') productId: string, @Query('channel') channel: SalesChannel = SalesChannel.PUBLIC_WEB) { return this.pricing.resolve(productId, { channel }); }
  @Get('admin/prices') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) list(@Query('productId') productId?: string) { return this.pricing.list(productId); }
  @Post('admin/prices') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) create(@Body() dto: CreatePriceDto, @Req() req: UserRequest) { return this.pricing.create(dto, req.user); }
}
