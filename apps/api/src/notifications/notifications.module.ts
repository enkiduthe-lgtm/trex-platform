import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationOutboxService } from './notification-outbox.service';
@Module({ controllers: [NotificationsController], providers: [NotificationsService, NotificationOutboxService], exports: [NotificationsService] }) export class NotificationsModule {}
