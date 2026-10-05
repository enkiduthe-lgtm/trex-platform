import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';

@Injectable()
export class PaytrPaymentProvider {
  async initialize(input: { amount: string; currency: string; reference: string; email: string; name: string; phone: string; address: string; basket: string; userIp: string }) {
    const merchantId = process.env.PAYTR_MERCHANT_ID; const key = process.env.PAYTR_MERCHANT_KEY; const salt = process.env.PAYTR_MERCHANT_SALT;
    if (!merchantId || !key || !salt) throw new ServiceUnavailableException('PayTR ayarları eksik');
    const amount = String(Math.round(Number(input.amount) * 100)); const testMode = process.env.PAYTR_TEST_MODE === '1' ? '1' : '0';
    const tokenData = `${merchantId}${input.userIp}${input.reference}${input.email}${amount}card0${input.currency}${testMode}0`;
    const token = createHmac('sha256', key).update(`${tokenData}${salt}`).digest('base64');
    const body = new URLSearchParams({ merchant_id: merchantId, user_ip: input.userIp, merchant_oid: input.reference, email: input.email, payment_amount: amount, payment_type: 'card', installment_count: '0', currency: input.currency, test_mode: testMode, non_3d: '0', merchant_ok_url: `${process.env.PUBLIC_WEB_URL ?? 'https://www.trextea.com.tr'}/siparis/basarili`, merchant_fail_url: `${process.env.PUBLIC_WEB_URL ?? 'https://www.trextea.com.tr'}/siparis/basarisiz`, user_name: input.name, user_address: input.address, user_phone: input.phone, merchant_basket: input.basket, debug_on: testMode, no_installment: '0', max_installment: '0', timeout_limit: '30', lang: 'tr', paytr_token: token });
    const response = await fetch('https://www.paytr.com/odeme/api/get-token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const result = await response.json() as { status: string; token?: string; reason?: string };
    if (!response.ok || result.status !== 'success' || !result.token) throw new ServiceUnavailableException(`PayTR ödeme ekranı açılamadı: ${result.reason ?? 'bilinmeyen hata'}`);
    return { providerReference: input.reference, redirectUrl: `https://www.paytr.com/odeme/guvenli/${result.token}` };
  }
}
