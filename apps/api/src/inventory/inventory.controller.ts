import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ReserveStockDto } from './dto/reserve-stock.dto';
import { InventoryService } from './inventory.service';
type UserRequest = Request & { user: RequestUser };
@Controller('inventory') @UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  @Post('adjustments') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE) adjust(@Body() dto: AdjustStockDto, @Req() req: UserRequest) { return this.inventory.adjust(dto, req.user); }
  // This endpoint is internal-only for the checkout flow until that module is published.
  @Post('reservations') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) reserve(@Body() dto: ReserveStockDto) { return this.inventory.reserve(dto); }
}
