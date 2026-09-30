import { ServiceUnavailableException } from '@nestjs/common';

export function assertMockIntegrationAllowed(provider: 'PAYMENT_PROVIDER' | 'SHIPPING_PROVIDER') {
  if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException(`${provider} mock adapter is disabled in production`);
}
