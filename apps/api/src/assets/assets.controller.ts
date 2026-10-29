import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { AssetsService } from './assets.service';
class CreateMockAssetDto { @IsString() filename!:string; @IsIn(['image/jpeg','image/png','image/webp','image/svg+xml']) mimeType!:string; @IsInt() @Min(1) @Max(2_000_000) byteSize!:number; @IsOptional() @IsInt() @Min(1) width?:number; @IsOptional() @IsInt() @Min(1) height?:number; @IsString() placement!:string; }
class UploadAssetDto { @IsString() placement!:string; }
type UploadedAsset={originalname:string;mimetype:string;size:number;buffer:Buffer};
type UserRequest=Request&{user:RequestUser};
@Controller('admin/assets') @UseGuards(JwtAuthGuard,RolesGuard) @RequireRoles(Roles.SUPER_ADMIN,Roles.ADMIN)
export class AssetsController { constructor(private readonly assets:AssetsService){} @Post('mock') create(@Body() dto:CreateMockAssetDto,@Req() req:UserRequest){return this.assets.createMock({...dto,userId:req.user.id})} @Post('upload') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:2_000_000}})) upload(@UploadedFile() file:UploadedAsset|undefined,@Body() dto:UploadAssetDto,@Req() req:UserRequest){if(!file)throw new BadRequestException('Image file is required');return this.assets.upload({filename:file.originalname,mimeType:file.mimetype,buffer:file.buffer,placement:dto.placement,userId:req.user.id})} }

@Controller('assets')
export class PublicAssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get('product/:productId')
  async productImage(@Param('productId', ParseUUIDPipe) productId: string, @Res() response: Response) {
    const image = await this.assets.productImage(productId);
    response.setHeader('Content-Type', image.mimeType);
    response.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
    response.send(image.buffer);
  }
}
