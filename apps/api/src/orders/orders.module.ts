import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { OrdersService } from './orders.service';
import { AdminOrderService } from './admin-order.service';
import { CommissionsModule } from '../commissions/commissions.module';
@Module({ imports: [CommissionsModule], controllers: [OrdersController, PublicOrdersController], providers: [OrdersService, AdminOrderService] }) export class OrdersModule {}
