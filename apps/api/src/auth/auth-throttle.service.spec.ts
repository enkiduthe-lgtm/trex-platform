import { AuthThrottleService } from './auth-throttle.service';

class RedisStub {
  readonly values = new Map<string, number>();
  readonly expiries = new Map<string,number>();
  async incr(key: string) { const next = (this.values.get(key) ?? 0) + 1; this.values.set(key, next); return next; }
  async pexpire(key:string,milliseconds:number) { this.expiries.set(key,milliseconds);return 1; }
  async pttl(key:string){return this.expiries.get(key)??-1;}
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
  it('limits reset delivery per normalized account without sharing the login quota',async()=>{
    const redis=new RedisStub(),service=new AuthThrottleService({getOrThrow:jest.fn()} as never,redis as never);
    for(let attempt=0;attempt<3;attempt++)await service.passwordResetRequest('203.0.113.10',' Owner@Example.invalid ');
    await expect(service.passwordResetRequest('203.0.113.11','owner@example.invalid')).rejects.toMatchObject({status:429});
    await expect(service.login('203.0.113.10','owner@example.invalid')).resolves.toBeUndefined();
    expect([...redis.values.keys()].every(key=>!key.includes('owner')&&!key.includes('203.0.113'))).toBe(true);
    expect([...redis.expiries.values()].every(value=>value===15*60_000)).toBe(true);
  });
  it('limits attempts for a reset token across source addresses without retaining the token',async()=>{
    const redis=new RedisStub(),service=new AuthThrottleService({getOrThrow:jest.fn()} as never,redis as never);
    for(let attempt=0;attempt<5;attempt++)await service.passwordResetConfirm('203.0.113.'+attempt,'synthetic-reset-secret');
    await expect(service.passwordResetConfirm('203.0.113.9','synthetic-reset-secret')).rejects.toMatchObject({status:429});
    expect([...redis.values.keys()].every(key=>!key.includes('synthetic-reset-secret'))).toBe(true);
  });
  it('limits MFA confirmation by account while retaining a separate disable quota',async()=>{
    const redis=new RedisStub(),service=new AuthThrottleService({getOrThrow:jest.fn()} as never,redis as never);
    for(let attempt=0;attempt<5;attempt++)await service.mfaChange('203.0.113.'+attempt,'synthetic-user','confirm');
    await expect(service.mfaChange('203.0.113.9','synthetic-user','confirm')).rejects.toMatchObject({status:429});
    await expect(service.mfaChange('203.0.113.9','synthetic-user','disable')).resolves.toBeUndefined();
    expect([...redis.expiries.values()].every(value=>value===5*60_000)).toBe(true);
  });
  it('does not permit a sensitive change when its protection store is unavailable',async()=>{
    const service=new AuthThrottleService({getOrThrow:jest.fn()} as never,{incr:jest.fn().mockRejectedValue(new Error('offline'))} as never);
    await expect(service.mfaChange('ip','user','confirm')).rejects.toMatchObject({status:503});
    await expect(service.passwordResetRequest('ip','synthetic@example.invalid')).rejects.toMatchObject({status:503});
  });
  it('repairs counters whose initial expiry write was interrupted without resetting normal windows',async()=>{
    const redis=new RedisStub(),service=new AuthThrottleService({getOrThrow:jest.fn()} as never,redis as never),expire=jest.spyOn(redis,'pexpire');
    expire.mockRejectedValueOnce(new Error('expiry write interrupted'));
    await expect(service.passwordResetRequest('synthetic-ip','synthetic@example.invalid')).rejects.toMatchObject({status:503});
    expect(redis.expiries.size).toBe(0);
    await expect(service.passwordResetRequest('synthetic-ip','synthetic@example.invalid')).resolves.toBeUndefined();
    expect(redis.expiries.size).toBe(2);const priorCalls=expire.mock.calls.length;
    await service.passwordResetRequest('synthetic-ip','synthetic@example.invalid');
    // Normal attempts must not extend the fixed protection window.
    expect(expire.mock.calls.length).toBe(priorCalls);
  });
});
