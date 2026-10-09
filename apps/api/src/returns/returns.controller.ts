import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { RequestReturnDto } from './dto/request-return.dto';
import { InspectReturnDto, ReceiveReturnDto, RefundReturnDto, ReviewReturnDto } from './dto/return-operation.dto';
import { ReturnsService } from './returns.service';
type UserRequest = Request & { user: RequestUser };
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}
  @Get('admin') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE, Roles.FINANCE) list() { return this.returns.listAdmin(); }
  @Post() request(@Body() dto: RequestReturnDto) { return this.returns.request(dto); }
  @Post(':id/approve') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) approve(@Param('id') id:string,@Body() dto:ReviewReturnDto,@Req() req:UserRequest) { return this.returns.approve(id,dto.notes,req.user.id); }
  @Post(':id/reject') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) reject(@Param('id') id:string,@Body() dto:ReviewReturnDto,@Req() req:UserRequest) { return this.returns.reject(id,dto.notes,req.user.id); }
  @Post(':id/receive') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE) receive(@Param('id') id:string,@Body() dto:ReceiveReturnDto,@Req() req:UserRequest) { return this.returns.receive(id,dto.notes,req.user.id); }
  @Post(':id/inspection') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE) inspect(@Param('id') id: string, @Body() dto:InspectReturnDto, @Req() req: UserRequest) { return this.returns.inspect(id, dto, req.user.id); }
  @Post(':id/refund') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE) refund(@Param('id') id:string,@Body() dto:RefundReturnDto,@Req() req:UserRequest) { return this.returns.refund(id,dto,req.user.id); }
}
