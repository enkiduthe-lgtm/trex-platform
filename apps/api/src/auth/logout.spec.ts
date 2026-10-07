import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

describe('Server-side logout', () => {
  function setup() {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1 }) };
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user', sid: 'session' }) };
    return { db, jwt, service: new AuthService(db as never, jwt as never) };
  }
  it('revokes signed bearer sessions even without a cross-site refresh cookie', async () => {
    const s = setup(); await s.service.logout('', 'signed-token');
    expect(s.jwt.verifyAsync).toHaveBeenCalledWith('signed-token', { ignoreExpiration: true });
    expect(s.db.query.mock.calls[0][1]).toEqual([null, 'session', 'user']);
    expect(s.db.query.mock.calls[0][0]).toContain('id=$2 AND user_id=$3');
    expect(s.db.query.mock.calls[0][0]).toContain('revoked_at IS NULL');
  });
  it('hashes refresh cookies instead of sending plaintext to SQL', async () => {
    const s = setup(); await s.service.logout('refresh-secret');
    expect(s.db.query.mock.calls[0][1]).toEqual([createHash('sha256').update('refresh-secret').digest('hex'), null, null]);
    expect(s.jwt.verifyAsync).not.toHaveBeenCalled();
  });
  it('ignores forged tokens without revoking arbitrary sessions', async () => {
    const s = setup(); s.jwt.verifyAsync.mockRejectedValue(new Error('signature'));
    await s.service.logout('', 'forged-token');
    expect(s.db.query).not.toHaveBeenCalled();
    await s.service.logout('valid-cookie', 'forged-token');
    expect(s.db.query.mock.calls[0][1].slice(1)).toEqual([null, null]);
  });
  it('missing credentials are an idempotent no-op', async () => {
    const s = setup(); await s.service.logout(''); expect(s.db.query).not.toHaveBeenCalled();
  });
  it('database failure is not reported as successful logout', async () => {
    const s = setup(); s.db.query.mockRejectedValue(new Error('database unavailable'));
    await expect(s.service.logout('', 'token')).rejects.toThrow('database unavailable');
  });
  it('controller forwards bearer credentials and clears the matching cookie path', async () => {
    const auth = { logout: jest.fn().mockResolvedValue(undefined) };
    const response = { clearCookie: jest.fn() };
    await new AuthController(auth as never).logout({ headers: { authorization: 'Bearer token' }, cookies: { trex_session: 'cookie' } } as never, response as never);
    expect(auth.logout).toHaveBeenCalledWith('cookie', 'token');
    expect(response.clearCookie).toHaveBeenCalledWith('trex_session', { path: '/v1/auth' });
  });
});
