import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
@Module({ controllers: [PaymentsController], providers: [PaymentsService, MockPaymentProvider] }) export class PaymentsModule {}
