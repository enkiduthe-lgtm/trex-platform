import { Module } from '@nestjs/common';
import { MockShippingProvider } from './mock-shipping.provider';
import { ArasShippingProvider } from './aras-shipping.provider';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
@Module({ controllers: [ShippingController], providers: [ShippingService, MockShippingProvider, ArasShippingProvider] }) export class ShippingModule {}
