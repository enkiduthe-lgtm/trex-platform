import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { WarehouseService } from './warehouse.service';
import { CreatePickDto } from './dto/create-pick.dto';
import { RequestUser } from '../auth/auth.types';
type UserRequest = Request & { user: RequestUser };

@Controller('admin/warehouse') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE)
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}
  @Get('dashboard') dashboard() { return this.warehouse.dashboard(); }
  @Get('picks') picks() { return this.warehouse.listPicks(); }
  @Get('critical-stock') criticalStock() { return this.warehouse.criticalStock(); }
  @Post('picks') createPick(@Body() dto: CreatePickDto, @Req() req: UserRequest) { return this.warehouse.createPick(dto.orderId, dto.warehouseId, req.user.id); }
  @Post('picks/:id/complete') completePick(@Param('id') id:string, @Req() req: UserRequest) { return this.warehouse.completePick(id, req.user.id); }
  @Post('picks/:id/pack') completePacking(@Param('id') id:string, @Req() req: UserRequest) { return this.warehouse.completePacking(id, req.user.id); }
}
