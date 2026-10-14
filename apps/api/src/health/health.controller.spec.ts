import { HealthController } from './health.controller';
describe('HealthController', () => {
  it('returns readiness when database responds', async () => {
    const controller = new HealthController({ query: jest.fn().mockResolvedValue({}) } as never, { waitUntilReady: jest.fn().mockResolvedValue(undefined) } as never);
    await expect(controller.ready()).resolves.toEqual({ status: 'ok', checks: { database: 'up', queue: 'up' } });
  });
  it('reports liveness without external dependencies', () => {
    const controller = new HealthController({} as never, {} as never);
    expect(controller.live()).toEqual({ status: 'ok' });
  });
  it('reports only safe runtime integrity metadata', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ name: '052_notification_outbox.sql', applied_at: '2026-10-14T00:00:00Z' }] }) };
    const queue = { waitUntilReady: jest.fn().mockResolvedValue(undefined) };
    const controller = new HealthController(db as never, queue as never);
    await expect(controller.integrity()).resolves.toMatchObject({ status: 'ok', migration: { name: '052_notification_outbox.sql' }, dependencies: { database: 'up', queue: 'up' } });
  });
});
