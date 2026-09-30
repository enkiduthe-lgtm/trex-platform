import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { ShippingService } from './shipping.service';
@Controller('admin/orders') @UseGuards(JwtAuthGuard, RolesGuard)
export class ShippingController { constructor(private readonly shipping: ShippingService) {} @Post(':id/shipment') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE) create(@Param('id') id: string) { return this.shipping.create(id); } }
