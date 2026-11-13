import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { OrdersService } from './orders.service';
import { AdminOrderService } from './admin-order.service';
import { CommissionsModule } from '../commissions/commissions.module';
import { ShippingModule } from '../shipping/shipping.module';
import { ParasutInvoiceProvider } from './parasut-invoice.provider';
@Module({ imports: [CommissionsModule, ShippingModule], controllers: [OrdersController, PublicOrdersController], providers: [OrdersService, AdminOrderService, ParasutInvoiceProvider], exports: [OrdersService, AdminOrderService] }) export class OrdersModule {}
