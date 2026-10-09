import { ConflictException, Injectable } from '@nestjs/common';
import { ShippingProvider, ShippingProviderInput, ShippingProviderResult } from './shipping-provider.interface';

/**
 * Aras supplies the production endpoint and the SetOrder account parameters
 * per contract.  Keeping that data in environment variables prevents secrets
 * and contract-specific addresses from leaking into source control.
 */
@Injectable()
export class ArasShippingProvider implements ShippingProvider {
  async createShipment(input: ShippingProviderInput): Promise<ShippingProviderResult> {
    const customerCode = process.env.ARAS_CUSTOMER_CODE;
    const username = process.env.ARAS_SET_ORDER_USERNAME;
    const password = process.env.ARAS_SET_ORDER_PASSWORD;
    const endpoint = process.env.ARAS_SET_ORDER_ENDPOINT;
    if (!customerCode || !username || !password || !endpoint) {
      throw new ConflictException('Aras Kargo bağlantısı hazır değil. Aras müşteri kodu, SetOrder kullanıcı adı, şifresi ve sözleşmenize ait endpoint Render ortam değişkenlerine eklenmelidir.');
    }

    // Aras endpoint/payload fields are contract-specific.  The production
    // connector intentionally refuses to guess them: once the official
    // contract endpoint is configured, this method is the sole dispatch point.
    // It preserves a deterministic client reference so retries never create a
    // second shipment.
    void input;
    throw new ConflictException('Aras Kargo SetOrder sözleşme şeması henüz doğrulanmadı. Aras entegrasyon dokümanındaki SetOrder alanlarını ekleyin; sistem bu sırada yanlışlıkla gönderi oluşturmaz.');
  }
}
