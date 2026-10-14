import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { CreatePageDto } from './dto/create-page.dto';
import { CreatePageRevisionDto } from './dto/create-page-revision.dto';
import { ContentService } from './content.service';
import { AcceptLegalDocumentDto } from './dto/accept-legal-document.dto';
import { CreateLegalDocumentDto } from './dto/create-legal-document.dto';
type UserRequest = Request & { user: RequestUser };
@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}
  @Get('pages/:slug') public(@Param('slug') slug: string) { return this.content.getPublic(slug); }
  @Get('legal-documents') legal() { return this.content.listPublicLegal(); }
  @Post('legal-documents/:code/accept') @UseGuards(JwtAuthGuard)
  acceptLegal(@Param('code') code: string, @Body() dto: AcceptLegalDocumentDto, @Req() req: UserRequest) {
    const ip = req.ip?.split(',')[0]?.trim();
    return this.content.acceptLegal(code, dto, req.user.id, ip);
  }
  @Get('admin/legal-documents') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  listLegal() { return this.content.listAdminLegal(); }
  @Post('admin/legal-documents') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  createLegal(@Body() dto: CreateLegalDocumentDto, @Req() req: UserRequest) { return this.content.createLegal(dto, req.user.id); }
  @Post('admin/legal-documents/:id/publish') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  publishLegal(@Param('id') id: string, @Req() req: UserRequest) { return this.content.publishLegal(id, req.user.id); }
  @Get('admin/pages') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) list() { return this.content.listAdmin(); }
  @Get('admin/pages/:id') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) detail(@Param('id') id: string) { return this.content.getAdminPage(id); }
  @Post('admin/pages') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) create(@Body() dto: CreatePageDto, @Req() req: UserRequest) { return this.content.createPage(dto, req.user.id); }
  @Post('admin/pages/:id/revisions') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) createRevision(@Param('id') id: string, @Body() dto: CreatePageRevisionDto, @Req() req: UserRequest) { return this.content.createRevision(id, dto, req.user.id); }
  @Post('admin/pages/:id/publish') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) publish(@Param('id') id: string) { return this.content.publish(id); }
}
