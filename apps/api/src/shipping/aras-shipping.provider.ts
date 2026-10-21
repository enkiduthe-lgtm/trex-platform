import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ShippingProvider, ShippingProviderInput, ShippingProviderResult } from './shipping-provider.interface';

type ArasResult = { code: string; message: string; trackingNumber: string | null };

/** Contract implementation for Aras Kargo's SetOrder SOAP service. */
@Injectable()
export class ArasShippingProvider implements ShippingProvider {
  async createShipment(input: ShippingProviderInput): Promise<ShippingProviderResult> {
    const customerCode = process.env.ARAS_CUSTOMER_CODE;
    const username = process.env.ARAS_SET_ORDER_USERNAME;
    const password = process.env.ARAS_SET_ORDER_PASSWORD;
    const endpoint = process.env.ARAS_SET_ORDER_ENDPOINT;
    if (!customerCode || !username || !password || !endpoint) {
      throw new ConflictException('Aras Kargo bağlantısı hazır değil. Aras müşteri kodu, SetOrder kullanıcı adı, şifresi ve canlı servis adresi Render ortam değişkenlerine eklenmelidir.');
    }

    const orderReference = this.limit(input.orderNumber, 16);
    // Aras validates this identifier strictly and rejects lowercase characters.
    // Keeping it deterministic also makes a retry for the same order idempotent.
    const integrationCode = this.limit(input.orderId.replaceAll('-', '').toUpperCase(), 32);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/soap+xml; charset=utf-8', SOAPAction: 'http://tempuri.org/IArasCargoIntegrationService/SetOrder' },
      body: this.envelope({ username, password, orderReference, integrationCode, input }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => { throw new ServiceUnavailableException('Aras Kargo servisine ulaşılamadı'); });

    const payload = await response.text();
    if (!response.ok) throw new ServiceUnavailableException(`Aras Kargo isteği başarısız oldu (${response.status})`);
    const result = this.parse(payload);
    if (result.code !== '0') throw new ConflictException(`Aras Kargo gönderi kaydı oluşturulamadı: ${result.message || `hata kodu ${result.code}`}`);

    return {
      reference: integrationCode,
      trackingNumber: result.trackingNumber ?? orderReference,
      payload: { customerCode, integrationCode, responseCode: result.code, responseMessage: result.message },
    };
  }

  private envelope({ username, password, orderReference, integrationCode, input }: { username: string; password: string; orderReference: string; integrationCode: string; input: ShippingProviderInput }) {
    const phone = input.phone.replace(/\D/g, '').slice(-10);
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tem="http://tempuri.org/"><soap:Body><SetOrder xmlns="http://tempuri.org/"><orderInfo><Order>
<UserName>${this.xml(username)}</UserName><Password>${this.xml(password)}</Password><TradingWaybillNumber>${this.xml(orderReference)}</TradingWaybillNumber><IntegrationCode>${this.xml(integrationCode)}</IntegrationCode>
<ReceiverName>${this.xml(this.limit(input.recipientName, 100))}</ReceiverName><ReceiverAddress>${this.xml(this.limit(input.addressLine, 250))}</ReceiverAddress><ReceiverPhone1>${this.xml(phone)}</ReceiverPhone1><ReceiverCityName>${this.xml(this.limit(input.city, 40))}</ReceiverCityName><ReceiverTownName>${this.xml(this.limit(input.district, 16))}</ReceiverTownName>
<PieceCount>1</PieceCount><PayorTypeCode>1</PayorTypeCode><IsWorldWide>0</IsWorldWide>
</Order></orderInfo><userName>${this.xml(username)}</userName><password>${this.xml(password)}</password></SetOrder></soap:Body></soap:Envelope>`;
  }

  private parse(xml: string): ArasResult {
    const find = (names: string[]) => names.map(name => new RegExp(`<(?:(?:\\w+:)?${name})[^>]*>([\\s\\S]*?)</(?:(?:\\w+:)?${name})>`, 'i').exec(xml)?.[1]?.trim()).find(Boolean) ?? '';
    return { code: find(['ResultCode', 'Code', 'Result']) || 'unknown', message: this.decode(find(['ResultMessage', 'Message', 'Explanation'])), trackingNumber: this.decode(find(['CargoKey', 'TrackingNumber', 'TrackingNo', 'WaybillNumber'])) || null };
  }

  private xml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
  private decode(value: string) { return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }
  private limit(value: string, max: number) { return value.trim().slice(0, max); }
}
