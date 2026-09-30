import { Body, Controller, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { SetParentDto } from './dto/set-parent.dto';
import { DealersService } from './dealers.service';
type UserRequest = Request & { user: RequestUser };
@Controller('admin/dealers') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
export class DealersController {
  constructor(private readonly dealers: DealersService) {}
  @Post() create(@Body() dto: CreateDealerDto, @Req() req: UserRequest) { return this.dealers.create(dto, req.user); }
  @Patch(':id/parent') parent(@Param('id') id: string, @Body() dto: SetParentDto, @Req() req: UserRequest) { return this.dealers.setParent(id, dto.parentDealerId, req.user); }
}
