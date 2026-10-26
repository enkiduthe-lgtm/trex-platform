import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { OrdersService } from './orders.service';
import { AdminOrderService } from './admin-order.service';
import { CommissionsModule } from '../commissions/commissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ParasutInvoiceProvider } from './parasut-invoice.provider';
@Module({ imports: [CommissionsModule, NotificationsModule], controllers: [OrdersController, PublicOrdersController], providers: [OrdersService, AdminOrderService, ParasutInvoiceProvider], exports: [OrdersService, AdminOrderService] }) export class OrdersModule {}
