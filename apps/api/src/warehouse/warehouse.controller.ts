import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { WarehouseService } from './warehouse.service';

@Controller('admin/warehouse') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE)
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}
  @Get('dashboard') dashboard() { return this.warehouse.dashboard(); }
  @Get('picks') picks() { return this.warehouse.listPicks(); }
  @Get('critical-stock') criticalStock() { return this.warehouse.criticalStock(); }
}
