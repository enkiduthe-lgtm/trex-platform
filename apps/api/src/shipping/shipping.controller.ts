import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { ShippingService } from './shipping.service';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';
import { RequestUser } from '../auth/auth.types';
type UserRequest = Request & { user: RequestUser };
@Controller('admin/orders') @UseGuards(JwtAuthGuard, RolesGuard)
export class ShippingController { constructor(private readonly shipping: ShippingService) {}
  @Get('shipping') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE) list() { return this.shipping.list(); }
  @Get('shipping/queue') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE) queue() { return this.shipping.readyToShip(); }
  @Get('shipping/status') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) status() { return this.shipping.status(); }
  @Get(':id/shipment') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE) detail(@Param('id') id: string) { return this.shipping.detail(id); }
  @Post(':id/shipment') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE) create(@Param('id') id: string) { return this.shipping.create(id); }
  @Post(':id/shipment/status') @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE) updateStatus(@Param('id') id:string,@Body() dto:UpdateShipmentStatusDto,@Req() req:UserRequest){return this.shipping.updateStatus(id,dto,req.user.id);}
}
