import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const saved = process.env.NODE_ENV;
  afterEach(() => { if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved; });
  it('persists only message content and mock provider result', async () => {
    process.env.NODE_ENV = 'test';
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 'notification' }] }).mockResolvedValueOnce({ rows: [] }) };
    const service = new NotificationsService(db as never);
    await expect(service.sendMock({ channel: 'EMAIL' as never, recipient: 'iletisim@trextea.tr', body: 'Test' })).resolves.toMatchObject({ status: 'SENT' });
    expect(db.query).toHaveBeenCalledTimes(2);
  });
  it('does not record a fake notification in production', async () => {
    process.env.NODE_ENV = 'production';
    const db = { query: jest.fn() }; const service = new NotificationsService(db as never);
    await expect(service.sendMock({ channel: 'SMS' as never, recipient: '5550000000', body: 'Test' })).rejects.toThrow('disabled in production');
    expect(db.query).not.toHaveBeenCalled();
  });
});
