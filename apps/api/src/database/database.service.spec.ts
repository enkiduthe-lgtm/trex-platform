import { DatabaseService } from './database.service';
describe('Database transaction safety', () => {
  function setup() {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    const pool = { connect: jest.fn().mockResolvedValue(client) };
    return { client, service: new DatabaseService(pool as never) };
  }
  it('commits successful work and releases the connection', async () => {
    const s = setup();
    await expect(s.service.transaction(async client => { await client.query('WORK'); return 'done'; })).resolves.toBe('done');
    expect(s.client.query.mock.calls.map(call => call[0])).toEqual(['BEGIN','WORK','COMMIT']);
    expect(s.client.release).toHaveBeenCalledTimes(1);
  });
  it('rolls back business or audit failures and releases the connection', async () => {
    const s = setup();
    await expect(s.service.transaction(async client => { await client.query('CHANGE'); throw new Error('audit failed'); })).rejects.toThrow('audit failed');
    expect(s.client.query.mock.calls.map(call => call[0])).toEqual(['BEGIN','CHANGE','ROLLBACK']);
    expect(s.client.release).toHaveBeenCalledTimes(1);
  });
});
