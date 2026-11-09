import { AuthService } from './auth.service';

describe('Session lifetime', () => {
  it('preserves the original expiry when refreshing an active session', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'old', user_id: 'user', email: 'user@example.com', role: 'ADMIN', expires_at: expiresAt }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'new' }] }) };
    const db = { transaction: async (work: (value: typeof client) => unknown) => work(client) };
    const jwt = { signAsync: jest.fn().mockResolvedValue('access') };
    const service = new AuthService(db as never, jwt as never, {} as never);
    const result = await service.rotate('refresh', {});
    expect(result.expiresAt).toEqual(expiresAt);
    expect(client.query.mock.calls[2][1][2]).toEqual(expiresAt);
  });
  it('rejects an expired session without creating a replacement', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const db = { transaction: async (work: (value: typeof client) => unknown) => work(client) };
    const service = new AuthService(db as never, {} as never, {} as never);
    await expect(service.rotate('expired', {})).rejects.toThrow();
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
