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
});
