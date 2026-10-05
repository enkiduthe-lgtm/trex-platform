import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { WarehouseService } from './warehouse.service';
import { CreatePickDto } from './dto/create-pick.dto';
import { UpdatePickItemDto } from './dto/update-pick-item.dto';
import { RequestUser } from '../auth/auth.types';
type UserRequest = Request & { user: RequestUser };

@Controller('admin/warehouse') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE)
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}
  @Get('dashboard') dashboard() { return this.warehouse.dashboard(); }
  @Get('picks') picks() { return this.warehouse.listPicks(); }
  @Get('picks/:id') pick(@Param('id') id:string) { return this.warehouse.getPick(id); }
  @Get('critical-stock') criticalStock() { return this.warehouse.criticalStock(); }
  @Post('picks') createPick(@Body() dto: CreatePickDto, @Req() req: UserRequest) { return this.warehouse.createPick(dto.orderId, dto.warehouseId, req.user.id); }
  @Patch('picks/:pickId/items/:itemId') updatePickedQuantity(@Param('pickId') pickId:string, @Param('itemId') itemId:string, @Body() dto: UpdatePickItemDto, @Req() req: UserRequest) { return this.warehouse.updatePickedQuantity(pickId, itemId, dto.pickedQuantity, req.user.id); }
  @Post('picks/:id/complete') completePick(@Param('id') id:string, @Req() req: UserRequest) { return this.warehouse.completePick(id, req.user.id); }
  @Post('picks/:id/pack') completePacking(@Param('id') id:string, @Req() req: UserRequest) { return this.warehouse.completePacking(id, req.user.id); }
}
