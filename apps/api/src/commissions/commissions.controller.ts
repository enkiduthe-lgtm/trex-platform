import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { CreateCommissionRuleV5Dto, PayCommissionDto, ReverseCommissionDto } from './dto/commission-operation.dto';
import { CommissionsService } from './commissions.service';
import { RequestUser } from '../auth/auth.types';
type UserRequest = Request & { user: RequestUser };
@Controller('admin/commissions') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE)
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}
  @Get() list() { return this.commissions.list(); }
  @Post('rules') createRule(@Body() dto: CreateCommissionRuleDto) { return this.commissions.createRule(dto); }
  @Post('staff-rules') createStaffRule(@Body() dto: CreateCommissionRuleV5Dto, @Req() req: UserRequest) { return this.commissions.createStaffRule(dto, req.user); }
  @Delete('rules/:id') deactivate(@Param('id') id:string,@Req() req:UserRequest){return this.commissions.deactivateRule(id,req.user);}
  @Post('entries/:id/finalize') finalize(@Param('id') id:string,@Req() req:UserRequest){return this.commissions.finalize(id,req.user);}
  @Post('entries/:id/pay') pay(@Param('id') id:string,@Body() dto:PayCommissionDto,@Req() req:UserRequest){return this.commissions.pay(id,dto,req.user);}
  @Post('entries/:id/reverse') reverse(@Param('id') id:string,@Body() dto:ReverseCommissionDto,@Req() req:UserRequest){return this.commissions.reverse(id,dto,req.user);}
}
