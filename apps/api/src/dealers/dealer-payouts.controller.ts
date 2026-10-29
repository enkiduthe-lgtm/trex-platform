import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RequestUser } from '../auth/auth.types';
import { DealerPayoutsService } from './dealer-payouts.service';
class RequestPayoutDto { @IsUUID() requestKey!:string; @IsNumber({maxDecimalPlaces:2}) @Min(0.01) @Max(9999999999.99) amount!:number; }
class DecideDto { @IsIn(['APPROVED','REJECTED']) status!:'APPROVED'|'REJECTED'; @IsOptional() @IsString() @MaxLength(500) note?:string; }
class PaidDto { @IsUUID() accountId!:string; @IsString() @MinLength(1) @MaxLength(160) referenceNumber!:string; }
class ReturnFeeDto { @IsUUID() returnId!:string; @IsNumber({maxDecimalPlaces:2}) @Min(0.01) @Max(9999999999.99) amount!:number; @IsString() @MinLength(1) @MaxLength(500) note!:string; }
type UserRequest=Request&{user:RequestUser};
@Controller() @UseGuards(JwtAuthGuard,RolesGuard)
export class DealerPayoutsController {
 constructor(private readonly payouts:DealerPayoutsService) {}
 @Get('dealer-portal/wallet') @RequireRoles(Roles.DEALER) wallet(@Req() req:UserRequest){return this.payouts.portal(req.user.id);}
 @Post('dealer-portal/payout-requests') @RequireRoles(Roles.DEALER) request(@Body() dto:RequestPayoutDto,@Req() req:UserRequest){return this.payouts.request(req.user.id,dto.requestKey,dto.amount);}
 @Get('admin/dealer-payouts') @RequireRoles(Roles.SUPER_ADMIN,Roles.ADMIN,Roles.FINANCE) list(){return this.payouts.list();}
 @Post('admin/dealer-payouts/return-fee') @RequireRoles(Roles.SUPER_ADMIN,Roles.ADMIN,Roles.FINANCE) fee(@Body() dto:ReturnFeeDto,@Req() req:UserRequest){return this.payouts.returnFee(dto.returnId,dto.amount,dto.note,req.user.id);}
 @Post('admin/dealer-payouts/:id/decision') @RequireRoles(Roles.SUPER_ADMIN,Roles.ADMIN) decide(@Param('id',ParseUUIDPipe) id:string,@Body() dto:DecideDto,@Req() req:UserRequest){return this.payouts.decide(id,dto.status,req.user.id,dto.note);}
 @Post('admin/dealer-payouts/:id/paid') @RequireRoles(Roles.SUPER_ADMIN,Roles.ADMIN,Roles.FINANCE) paid(@Param('id',ParseUUIDPipe) id:string,@Body() dto:PaidDto,@Req() req:UserRequest){return this.payouts.pay(id,dto.accountId,dto.referenceNumber,req.user.id);}
}
