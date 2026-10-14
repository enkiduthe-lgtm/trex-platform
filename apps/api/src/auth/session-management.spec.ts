import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('Session management', () => {
  const user = { sub: 'user-1', email: 'owner@trextea.com.tr', role: 'ADMIN' as const, sid: 'current-session' };

  function setup() {
    const client = { query: jest.fn() };
    const db = { query: jest.fn(), transaction: jest.fn(async (work: (value: typeof client) => unknown) => work(client)) };
    const service = new AuthService(db as never, {} as never, {} as never);
    return { db, client, service };
  }

  it('lists only active sessions and identifies the current device without token data', async () => {
    const s = setup();
    s.db.query.mockResolvedValue({ rows: [{ id: 'other-session', created_at: '2026-10-14T00:00:00Z', expires_at: '2026-11-14T00:00:00Z', ip: '127.0.0.1', user_agent: 'Browser' }, { id: 'current-session', created_at: '2026-10-13T00:00:00Z', expires_at: '2026-11-13T00:00:00Z', ip: null, user_agent: null }] });

    await expect(s.service.listSessions(user)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current-session', current: true }),
      expect.objectContaining({ id: 'other-session', current: false }),
    ]));
    expect(s.db.query.mock.calls[0][0]).toContain('revoked_at IS NULL');
    expect(s.db.query.mock.calls[0][0]).not.toContain('token_hash');
  });

  it('revokes a different active session and records an audit event', async () => {
    const s = setup();
    s.client.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'other-session' }] }).mockResolvedValueOnce({ rowCount: 1 });

    await expect(s.service.revokeSession(user, 'other-session')).resolves.toEqual({ id: 'other-session', revoked: true });
    expect(s.client.query.mock.calls[0][1]).toEqual(['other-session', 'user-1']);
    expect(s.client.query.mock.calls[1][1]).toEqual(['user-1', 'session.revoked', 'session', 'other-session']);
  });

  it('does not allow a current session to revoke itself through the device endpoint', async () => {
    const s = setup();
    await expect(s.service.revokeSession(user, 'current-session')).rejects.toBeInstanceOf(ConflictException);
    expect(s.db.transaction).not.toHaveBeenCalled();
  });

  it('reports a missing, expired, or already closed device session', async () => {
    const s = setup();
    s.client.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(s.service.revokeSession(user, 'missing-session')).rejects.toBeInstanceOf(NotFoundException);
  });
});
