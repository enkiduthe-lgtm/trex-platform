import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; import { RolesGuard } from '../auth/roles.guard'; import { RequireRoles } from '../auth/roles.decorator'; import { Roles } from '../auth/roles'; import { CampaignsService } from './campaigns.service';
import { RequestUser } from '../auth/auth.types';
class CampaignDto { @IsString() @MaxLength(160) name!: string; @IsOptional() @IsISO8601() startsAt?: string; @IsOptional() @IsISO8601() endsAt?: string; }
class CouponDto { @IsString() @MaxLength(64) code!: string; @IsIn(['FIXED_TRY','PERCENT']) discountType!: 'FIXED_TRY'|'PERCENT'; @IsInt() @Min(1) @Max(1000000) discountValue!: number; @IsOptional() @IsInt() @Min(1) usageLimit?: number; @IsOptional() @IsISO8601() startsAt?: string; @IsOptional() @IsISO8601() endsAt?: string; }
class CouponPreviewDto { @IsString() @MaxLength(64) code!:string; @IsNumber() @Min(0) @Max(10000000) subtotal!:number; }
@Controller('coupons') export class CouponsController { constructor(private readonly campaigns:CampaignsService){} @Post('preview') preview(@Body() dto:CouponPreviewDto){return this.campaigns.previewCoupon(dto.code,dto.subtotal)} }
type UserRequest=Request&{user:RequestUser};
@Controller('admin/campaigns') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
export class CampaignsController { constructor(private readonly campaigns: CampaignsService) {} @Get() list(){return this.campaigns.list()} @Get('coupons') coupons(){return this.campaigns.listCoupons()} @Post() create(@Body() dto:CampaignDto,@Req() req:UserRequest){return this.campaigns.create(dto.name,req.user.id,dto.startsAt,dto.endsAt)} @Post(':id/activate') activate(@Param('id') id:string,@Req() req:UserRequest){return this.campaigns.activate(id,req.user.id)} @Post(':id/pause') pause(@Param('id') id:string,@Req() req:UserRequest){return this.campaigns.pause(id,req.user.id)} @Post(':id/coupons') coupon(@Param('id') id:string,@Body() dto:CouponDto,@Req() req:UserRequest){return this.campaigns.createCoupon(id,dto,req.user.id)} }
