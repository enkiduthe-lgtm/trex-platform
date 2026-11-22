import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; import { RolesGuard } from '../auth/roles.guard'; import { RequireRoles } from '../auth/roles.decorator'; import { Roles } from '../auth/roles'; import { CampaignsService } from './campaigns.service';
import { RequestUser } from '../auth/auth.types';
class CampaignDto { @IsString() @MaxLength(160) name!: string; @IsOptional() @IsISO8601() startsAt?: string; @IsOptional() @IsISO8601() endsAt?: string; }
class CouponDto { @IsString() @MaxLength(64) code!: string; @IsIn(['FIXED_TRY','PERCENT']) discountType!: 'FIXED_TRY'|'PERCENT'; @IsInt() @Min(1) @Max(1000000) discountValue!: number; @IsOptional() @IsInt() @Min(1) usageLimit?: number; @IsOptional() @IsISO8601() startsAt?: string; @IsOptional() @IsISO8601() endsAt?: string; }
class CouponPreviewDto { @IsString() @MaxLength(64) code!:string; @IsNumber() @Min(0) @Max(10000000) subtotal!:number; }
class CampaignStatusDto { @IsOptional() @IsIn(['DRAFT','ACTIVE','PAUSED','ARCHIVED']) expectedStatus?:string; }
@Controller('coupons') export class CouponsController { constructor(private readonly campaigns:CampaignsService){} @Post('preview') preview(@Body() dto:CouponPreviewDto){return this.campaigns.previewCoupon(dto.code,dto.subtotal)} }
type UserRequest=Request&{user:RequestUser};
@Controller('admin/campaigns') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
export class CampaignsController {
 constructor(private readonly campaigns:CampaignsService){}
 @Get() list(){return this.campaigns.list();}
 @Get('coupons') coupons(){return this.campaigns.listCoupons();}
 @Post() create(@Body() dto:CampaignDto,@Req() req:UserRequest){return this.campaigns.create(dto.name,req.user.id,dto.startsAt,dto.endsAt);}
 @Post('idempotent') createIdempotent(@Body() dto:CampaignDto,@Req() req:UserRequest,@Headers('idempotency-key') key?:string){return this.campaigns.create(dto.name,req.user.id,dto.startsAt,dto.endsAt,key??'');}
 @Post(':id/activate') activate(@Param('id',new ParseUUIDPipe()) id:string,@Req() req:UserRequest,@Body() dto:CampaignStatusDto){return this.campaigns.activate(id,req.user.id,dto?.expectedStatus);}
 @Post(':id/pause') pause(@Param('id',new ParseUUIDPipe()) id:string,@Req() req:UserRequest,@Body() dto:CampaignStatusDto){return this.campaigns.pause(id,req.user.id,dto?.expectedStatus);}
 @Post(':id/coupons') coupon(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:CouponDto,@Req() req:UserRequest){return this.campaigns.createCoupon(id,dto,req.user.id);}
 @Post(':id/coupons/idempotent') couponIdempotent(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:CouponDto,@Req() req:UserRequest,@Headers('idempotency-key') key?:string){return this.campaigns.createCoupon(id,dto,req.user.id,key??'');}
}
