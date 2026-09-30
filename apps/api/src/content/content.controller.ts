import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { CreatePageDto } from './dto/create-page.dto';
import { ContentService } from './content.service';
type UserRequest = Request & { user: RequestUser };
@Controller()
export class ContentController { constructor(private readonly content: ContentService) {} @Get('pages/:slug') public(@Param('slug') slug: string) { return this.content.getPublic(slug); } @Post('admin/pages') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) create(@Body() dto: CreatePageDto, @Req() req: UserRequest) { return this.content.createPage(dto, req.user.id); } @Post('admin/pages/:id/publish') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) publish(@Param('id') id: string) { return this.content.publish(id); } }
