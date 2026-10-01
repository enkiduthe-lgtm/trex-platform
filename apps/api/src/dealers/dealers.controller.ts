import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { SetParentDto } from './dto/set-parent.dto';
import { CreateDealerLevelDto } from './dto/create-dealer-level.dto';
import { UpdateDealerStatusDto } from './dto/update-dealer-status.dto';
import { DealersService } from './dealers.service';
type UserRequest = Request & { user: RequestUser };
@Controller('admin/dealers') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
export class DealersController {
  constructor(private readonly dealers: DealersService) {}
  @Get() list() { return this.dealers.list(); }
  @Get('levels') levels() { return this.dealers.listLevels(); }
  @Post('levels') level(@Body() dto: CreateDealerLevelDto, @Req() req: UserRequest) { return this.dealers.createLevel(dto, req.user); }
  @Post() create(@Body() dto: CreateDealerDto, @Req() req: UserRequest) { return this.dealers.create(dto, req.user); }
  @Patch(':id/status') status(@Param('id') id: string, @Body() dto: UpdateDealerStatusDto, @Req() req: UserRequest) { return this.dealers.updateStatus(id, dto.status, req.user); }
  @Patch(':id/parent') parent(@Param('id') id: string, @Body() dto: SetParentDto, @Req() req: UserRequest) { return this.dealers.setParent(id, dto.parentDealerId, req.user); }
}
