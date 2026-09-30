import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { AssetsService } from './assets.service';
class CreateMockAssetDto { @IsString() filename!:string; @IsIn(['image/jpeg','image/png','image/webp','image/svg+xml']) mimeType!:string; @IsInt() @Min(1) @Max(2_000_000) byteSize!:number; @IsOptional() @IsInt() @Min(1) width?:number; @IsOptional() @IsInt() @Min(1) height?:number; @IsString() placement!:string; }
type UserRequest=Request&{user:RequestUser};
@Controller('admin/assets') @UseGuards(JwtAuthGuard,RolesGuard) @RequireRoles(Roles.SUPER_ADMIN,Roles.ADMIN)
export class AssetsController { constructor(private readonly assets:AssetsService){} @Post('mock') create(@Body() dto:CreateMockAssetDto,@Req() req:UserRequest){return this.assets.createMock({...dto,userId:req.user.id})} }
