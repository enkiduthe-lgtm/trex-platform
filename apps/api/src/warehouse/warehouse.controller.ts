import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { WarehouseService } from './warehouse.service';
import { CreatePickDto } from './dto/create-pick.dto';
import { UpdatePickItemDto } from './dto/update-pick-item.dto';
import { RequestUser } from '../auth/auth.types';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { ScanPickItemDto } from './dto/scan-pick-item.dto';
type UserRequest = Request & { user: RequestUser };

@Controller('admin/warehouse') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE)
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}
  @Get('dashboard') dashboard() { return this.warehouse.dashboard(); }
  @Get('locations') locations() { return this.warehouse.listLocations(); }
  @Get('stock') stock() { return this.warehouse.listStock(); }
  @Delete('stock/:warehouseId/:productId') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  deleteStock(@Param('warehouseId', ParseUUIDPipe) warehouseId:string, @Param('productId', ParseUUIDPipe) productId:string, @Req() req:UserRequest) { return this.warehouse.deleteStock(warehouseId,productId,req.user.id); }
  @Delete('locations/:id') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  deleteLocation(@Param('id', ParseUUIDPipe) id:string, @Req() req:UserRequest) { return this.warehouse.deleteLocation(id,req.user.id); }
  @Get('picks') picks() { return this.warehouse.listPicks(); }
  @Get('picks/queue') queue() { return this.warehouse.listPickQueue(); }
  @Get('picks/:id') pick(@Param('id') id:string) { return this.warehouse.getPick(id); }
  @Get('critical-stock') criticalStock() { return this.warehouse.criticalStock(); }
  @Post('locations') createLocation(@Body() dto: CreateWarehouseDto, @Req() req: UserRequest) { return this.warehouse.createLocation(dto, req.user.id); }
  @Post('receipts') receiveStock(@Body() dto: ReceiveStockDto, @Req() req: UserRequest) { return this.warehouse.receiveStock(dto, req.user.id); }
  @Post('picks') createPick(@Body() dto: CreatePickDto, @Req() req: UserRequest) { return this.warehouse.createPick(dto.orderId, dto.warehouseId, req.user.id); }
  @Post('picks/queue/:orderId') startQueuedPick(@Param('orderId', ParseUUIDPipe) orderId:string, @Req() req: UserRequest) { return this.warehouse.startQueuedPick(orderId, req.user.id); }
  @Patch('picks/:pickId/items/:itemId') updatePickedQuantity(@Param('pickId') pickId:string, @Param('itemId') itemId:string, @Body() dto: UpdatePickItemDto, @Req() req: UserRequest) { return this.warehouse.updatePickedQuantity(pickId, itemId, dto.pickedQuantity, req.user.id); }
  @Post('picks/:id/scan') scanPickBarcode(@Param('id') id:string, @Body() dto: ScanPickItemDto, @Req() req: UserRequest) { return this.warehouse.scanPickBarcode(id, dto.barcode, req.user.id); }
  @Post('picks/:id/complete') completePick(@Param('id') id:string, @Req() req: UserRequest) { return this.warehouse.completePick(id, req.user.id); }
  @Post('picks/:id/pack') completePacking(@Param('id') id:string, @Req() req: UserRequest) { return this.warehouse.completePacking(id, req.user.id); }
}
