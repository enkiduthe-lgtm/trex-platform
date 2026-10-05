import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}
  @Get('fulfillment') fulfillment() { return this.checkout.fulfillment(); }
  @Post() create(@Body() dto: CreateCheckoutDto, @Headers('idempotency-key') key?: string) { return this.checkout.create(dto, key ?? ''); }
}
