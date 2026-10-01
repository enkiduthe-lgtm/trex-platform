import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { RequestReturnDto } from './dto/request-return.dto';
import { ReturnsService } from './returns.service';
type UserRequest = Request & { user: RequestUser };
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}
  @Get('admin') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE, Roles.FINANCE) list() { return this.returns.listAdmin(); }
  @Post() request(@Body() dto: RequestReturnDto) { return this.returns.request(dto); }
  @Post(':id/inspection') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE) inspect(@Param('id') id: string, @Body() body: { accepted: boolean; notes?: string }, @Req() req: UserRequest) { return this.returns.inspect(id, body.accepted, body.notes, req.user.id); }
}
