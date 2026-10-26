import { Module } from '@nestjs/common';
import { DealersController } from './dealers.controller';
import { DealersService } from './dealers.service';
import { DealerApplicationsController } from './dealer-applications.controller';
import { DealerPortalController } from './dealer-portal.controller';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
@Module({ imports: [OrdersModule, NotificationsModule], controllers: [DealersController, DealerApplicationsController, DealerPortalController], providers: [DealersService] }) export class DealersModule {}
