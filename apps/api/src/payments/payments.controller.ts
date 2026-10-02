import { Body, Controller, Param, Post } from '@nestjs/common';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { PaymentsService } from './payments.service';
import { PaytrCallbackDto } from './dto/paytr-callback.dto';
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Post('initialize') initialize(@Body() dto: InitializePaymentDto) { return this.payments.initialize(dto.checkoutId,dto.guestKey); }
  @Post('paytr/callback') paytrCallback(@Body() dto: PaytrCallbackDto) { return this.payments.receivePaytrCallback(dto); }
  // In production this route is replaced/supplemented by verified, signed provider webhooks.
  @Post(':id/verify') verify(@Param('id') id: string) { return this.payments.verify(id); }
}
