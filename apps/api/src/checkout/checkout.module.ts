import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
@Module({ imports: [PricingModule], controllers: [CheckoutController], providers: [CheckoutService] }) export class CheckoutModule {}
