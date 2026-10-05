import { Controller, Get, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { TrackOrderQueryDto } from './dto/track-order-query.dto';

@Controller('orders')
export class PublicOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('track')
  track(@Query() query: TrackOrderQueryDto) { return this.orders.track(query.number, query.email); }
}
