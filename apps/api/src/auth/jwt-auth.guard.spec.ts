import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('Active user access', () => {
  function setup(rows: unknown[]) {
    const request: any = { headers: { authorization: 'Bearer token' } };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
    const db = { query: jest.fn().mockResolvedValue({ rows }) };
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user', sid: 'session', email: 'old@example.com', role: 'SUPER_ADMIN' }) };
    return { request, context, db, jwt, guard: new JwtAuthGuard(jwt as never, db as never) };
  }
  it('uses the current role instead of stale token privileges', async () => {
    const s = setup([{ email: 'current@example.com', role: 'WAREHOUSE' }]);
    await expect(s.guard.canActivate(s.context)).resolves.toBe(true);
    expect(s.request.user).toEqual({ id: 'user', sessionId: 'session', email: 'current@example.com', role: 'WAREHOUSE' });
    expect(s.db.query.mock.calls[0][0]).toContain('u.is_active=true');
    expect(s.db.query.mock.calls[0][1]).toEqual(['session', 'user']);
  });
  it('rejects inactive users and revoked or expired sessions', async () => {
    const s = setup([]);
    await expect(s.guard.canActivate(s.context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(s.request.user).toBeUndefined();
  });
  it('rejects requests without a token before accessing the database', async () => {
    const s = setup([]); s.request.headers = {};
    await expect(s.guard.canActivate(s.context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(s.db.query).not.toHaveBeenCalled();
  });
  it('rejects invalid signatures', async () => {
    const s = setup([]); s.jwt.verifyAsync.mockRejectedValue(new Error('signature'));
    await expect(s.guard.canActivate(s.context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(s.db.query).not.toHaveBeenCalled();
  });
});
