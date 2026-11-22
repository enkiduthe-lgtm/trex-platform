import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { CreateCommissionRuleV5Dto, PayCommissionDto, ReverseCommissionDto } from './dto/commission-operation.dto';
import { CommissionsService } from './commissions.service';
import { RequestUser } from '../auth/auth.types';
import { StaffChannelService } from './staff-channel.service';
import { StaffRateDto, StaffSettingsDto } from './dto/staff-channel.dto';
type UserRequest = Request & { user: RequestUser };
@Controller('admin/commissions') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE)
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService,private readonly staffChannels:StaffChannelService) {}
  @Get('channel-pools') channelPools(@Req() req:UserRequest,@Query('month') month?:string){return this.staffChannels.view(req.user,month);}
  @Post('channel-pools/settings') @RequireRoles(Roles.SUPER_ADMIN) settings(@Body() dto:StaffSettingsDto,@Req() req:UserRequest){return this.staffChannels.settings(dto,req.user);}
  @Post('channel-pools/rates') @RequireRoles(Roles.SUPER_ADMIN) rate(@Body() dto:StaffRateDto,@Req() req:UserRequest){return this.staffChannels.rate(dto,req.user);}
  @Get() list(@Req() req:UserRequest) { return this.commissions.list(req.user); }
  @Post('rules') @RequireRoles(Roles.SUPER_ADMIN) createRule(@Body() dto: CreateCommissionRuleDto,@Req() req:UserRequest) { return this.commissions.createRule(dto,req.user); }
  @Post('staff-rules') @RequireRoles(Roles.SUPER_ADMIN) createStaffRule(@Body() dto: CreateCommissionRuleV5Dto, @Req() req: UserRequest) { return this.commissions.createStaffRule(dto, req.user); }
  @Delete('rules/:id') @RequireRoles(Roles.SUPER_ADMIN) deactivate(@Param('id',new ParseUUIDPipe()) id:string,@Req() req:UserRequest){return this.commissions.deactivateRule(id,req.user);}
  @Post('entries/:id/finalize') @RequireRoles(Roles.SUPER_ADMIN) finalize(@Param('id',new ParseUUIDPipe()) id:string,@Req() req:UserRequest){return this.commissions.finalize(id,req.user);}
  @Post('entries/:id/pay') @RequireRoles(Roles.SUPER_ADMIN) pay(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:PayCommissionDto,@Req() req:UserRequest){return this.commissions.pay(id,dto,req.user);}
  @Post('entries/:id/reverse') @RequireRoles(Roles.SUPER_ADMIN) reverse(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ReverseCommissionDto,@Req() req:UserRequest){return this.commissions.reverse(id,dto,req.user);}
}
