/**
 * Render environment values are sometimes pasted with surrounding quotes.
 * A quoted Redis URL is parsed as a socket path by ioredis/BullMQ, so remove
 * only the wrapper without altering credentials inside the URL.
 */
export function normalizeRedisUrl(value: string): string {
  return value.trim().replace(/^(?:['\"]|%22)+|(?:['\"]|%22)+$/gi, '');
}

export function validateEnvironment(env: NodeJS.ProcessEnv): void {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.REDIS_URL || !normalizeRedisUrl(env.REDIS_URL).startsWith('redis')) throw new Error('REDIS_URL must be a valid Redis URL');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET.includes('replace-with-')) throw new Error('JWT_SECRET must be a unique value of at least 32 characters');
  if (production) {
    if (!env.CORS_ORIGIN || env.CORS_ORIGIN.split(',').some(origin => origin.trim() === '*')) throw new Error('Production CORS_ORIGIN must contain explicit origins');
    if (!env.PAYMENT_PROVIDER || !env.SHIPPING_PROVIDER || !env.NOTIFICATION_PROVIDER || env.PAYMENT_PROVIDER === 'mock' || env.SHIPPING_PROVIDER === 'mock' || env.NOTIFICATION_PROVIDER === 'mock') throw new Error('Production payment, shipping, and notification providers must be configured; mock adapters cannot run in production');
    if (env.PAYMENT_PROVIDER === 'paytr' && (!env.PAYTR_MERCHANT_ID || !env.PAYTR_MERCHANT_KEY || !env.PAYTR_MERCHANT_SALT || !env.PUBLIC_WEB_URL)) throw new Error('PayTR production settings are incomplete');
    if (env.SHIPPING_PROVIDER === 'aras' && (!env.ARAS_CUSTOMER_CODE || !env.ARAS_SET_ORDER_USERNAME || !env.ARAS_SET_ORDER_PASSWORD || !env.ARAS_SET_ORDER_ENDPOINT)) throw new Error('Aras shipping production settings are incomplete');
    if (env.NOTIFICATION_PROVIDER === 'brevo' && (!env.BREVO_API_KEY || !env.BREVO_FROM_EMAIL)) throw new Error('Brevo notification settings are incomplete');
  }
}
