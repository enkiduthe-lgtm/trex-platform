import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { OrdersService } from './orders.service';
@Module({ controllers: [OrdersController, PublicOrdersController], providers: [OrdersService] }) export class OrdersModule {}
