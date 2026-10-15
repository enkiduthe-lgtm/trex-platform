import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { AddSupportMessageDto, UpdateSupportTicketDto } from './dto/update-support-ticket.dto';
import { SupportService } from './support.service';

type UserRequest = Request & { user: RequestUser };

@Controller('admin/support-tickets') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Get('summary') summary() { return this.support.summary(); }
  @Get('assignees') assignees() { return this.support.assignees(); }
  @Get() list(@Query('status') status?: string) { return this.support.list(status); }
  @Get(':id') detail(@Param('id') id: string) { return this.support.detail(id); }
  @Post() create(@Body() dto: CreateSupportTicketDto, @Req() req: UserRequest) { return this.support.create(dto, req.user.id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateSupportTicketDto, @Req() req: UserRequest) { return this.support.update(id, dto, req.user.id); }
  @Post(':id/messages') addMessage(@Param('id') id: string, @Body() dto: AddSupportMessageDto, @Req() req: UserRequest) { return this.support.addMessage(id, dto, req.user.id); }
}
