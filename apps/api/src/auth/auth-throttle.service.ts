import { HttpException, HttpStatus, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Redis } from 'ioredis';

export type AuthThrottleRedis = Pick<Redis, 'incr' | 'pexpire' | 'quit'>;

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Redis-backed throttle for unauthenticated authentication endpoints.
 * It deliberately does not retain a raw IP address or email address in Redis.
 */
@Injectable()
export class AuthThrottleService implements OnModuleDestroy {
  private readonly redis: AuthThrottleRedis;

  constructor(config: ConfigService, redis?: AuthThrottleRedis) {
    this.redis = redis ?? new Redis(config.getOrThrow<string>('REDIS_URL'), { maxRetriesPerRequest: 1 });
  }

  private async consume(scope: string, subject: string, limit: number, windowMs: number) {
    const key = `trex:auth-throttle:${scope}:${hash(subject)}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.pexpire(key, windowMs);
      if (count > limit) {
        throw new HttpException('Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.', HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Authentication must not silently lose brute-force protection when Redis is unavailable.
      throw new ServiceUnavailableException('Giriş güvenlik servisi geçici olarak kullanılamıyor.');
    }
  }

  async login(ip: string, email: string) {
    await this.consume('login-ip', ip || 'unknown', 10, 15 * 60_000);
    await this.consume('login-email', email.trim().toLowerCase(), 5, 15 * 60_000);
  }

  async refresh(ip: string) {
    await this.consume('refresh-ip', ip || 'unknown', 30, 15 * 60_000);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
