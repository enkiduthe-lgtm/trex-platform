import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsService } from './notifications.service';
@Controller('admin/notifications') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
export class NotificationsController { constructor(private readonly notifications: NotificationsService) {} @Get() list() { return this.notifications.list(); } @Post() send(@Body() dto: CreateNotificationDto) { return this.notifications.sendMock(dto); } }
