import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaytrPaymentProvider } from './paytr-payment.provider';
@Module({ controllers: [PaymentsController], providers: [PaymentsService, MockPaymentProvider, PaytrPaymentProvider] }) export class PaymentsModule {}
