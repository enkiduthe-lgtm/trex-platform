export function validateEnvironment(env: NodeJS.ProcessEnv): void {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.REDIS_URL) throw new Error('REDIS_URL is required');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET.includes('replace-with-')) throw new Error('JWT_SECRET must be a unique value of at least 32 characters');
  if (production) {
    if (!env.CORS_ORIGIN || env.CORS_ORIGIN.split(',').some(origin => origin.trim() === '*')) throw new Error('Production CORS_ORIGIN must contain explicit origins');
    if (!env.PAYMENT_PROVIDER || !env.SHIPPING_PROVIDER || env.PAYMENT_PROVIDER === 'mock' || env.SHIPPING_PROVIDER === 'mock') throw new Error('Production payment and shipping providers must be configured; mock adapters cannot run in production');
  }
}
