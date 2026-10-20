import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationOutboxService } from './notification-outbox.service';
import { BrevoEmailProvider } from './brevo-email.provider';
@Module({ controllers: [NotificationsController], providers: [NotificationsService, NotificationOutboxService, BrevoEmailProvider], exports: [NotificationsService] }) export class NotificationsModule {}
