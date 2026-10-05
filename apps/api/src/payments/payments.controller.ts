import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { PaymentsService } from './payments.service';
import { PaytrCallbackDto } from './dto/paytr-callback.dto';
import { InitializeManualPaymentDto } from './dto/initialize-manual-payment.dto';
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Post('initialize') initialize(@Body() dto: InitializePaymentDto, @Req() req: Request) { return this.payments.initialize(dto.checkoutId,dto.guestKey,req.ip); }
  @Post('manual') manual(@Body() dto: InitializeManualPaymentDto) { return this.payments.initializeManual(dto.checkoutId, dto.guestKey, dto.method); }
  @Post('paytr/callback') paytrCallback(@Body() dto: PaytrCallbackDto) { return this.payments.receivePaytrCallback(dto); }
  // In production this route is replaced/supplemented by verified, signed provider webhooks.
  @Post(':id/verify') verify(@Param('id') id: string) { return this.payments.verify(id); }
}
