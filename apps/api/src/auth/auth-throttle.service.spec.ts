import { AuthThrottleService } from './auth-throttle.service';

class RedisStub {
  readonly values = new Map<string, number>();
  async incr(key: string) { const next = (this.values.get(key) ?? 0) + 1; this.values.set(key, next); return next; }
  async pexpire() { return 1; }
  async quit() { return 'OK'; }
}

describe('AuthThrottleService', () => {
  it('blocks the sixth attempt for one email address', async () => {
    const service = new AuthThrottleService({ getOrThrow: jest.fn() } as never, new RedisStub() as never);
    for (let attempt = 0; attempt < 5; attempt++) await service.login('203.0.113.10', 'owner@trextea.com.tr');
    await expect(service.login('203.0.113.11', 'owner@trextea.com.tr')).rejects.toMatchObject({ status: 429 });
  });

  it('blocks the eleventh attempt from one IP address', async () => {
    const service = new AuthThrottleService({ getOrThrow: jest.fn() } as never, new RedisStub() as never);
    for (let attempt = 0; attempt < 10; attempt++) await service.login('203.0.113.10', `user${attempt}@trextea.com.tr`);
    await expect(service.login('203.0.113.10', 'new@trextea.com.tr')).rejects.toMatchObject({ status: 429 });
  });
});
