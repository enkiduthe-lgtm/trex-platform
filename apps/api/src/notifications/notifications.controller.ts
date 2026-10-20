import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsService } from './notifications.service';
@Controller('admin/notifications') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
export class NotificationsController { constructor(private readonly notifications: NotificationsService) {} @Get() list() { return this.notifications.list(); } @Post() send(@Body() dto: CreateNotificationDto) { return this.notifications.send(dto); } @Post(':id/retry') async retry(@Param('id') id: string) { const item = await this.notifications.retry(id); if (!item) throw new NotFoundException('Yalnızca başarısız bildirimler yeniden denenebilir'); return item; } }
