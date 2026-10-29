import { Module } from '@nestjs/common';
import { MockShippingProvider } from './mock-shipping.provider';
import { ArasShippingProvider } from './aras-shipping.provider';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommissionsModule } from '../commissions/commissions.module';
@Module({ imports: [NotificationsModule,CommissionsModule], controllers: [ShippingController], providers: [ShippingService, MockShippingProvider, ArasShippingProvider] }) export class ShippingModule {}
