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
  it.each([
    ['database', true, false],
    ['queue', false, true],
  ])('identifies a failed %s without exposing connection details',async(_name,dbFails,queueFails)=>{
    const secretError=new Error('secret connection details');
    const db={query:dbFails?jest.fn().mockRejectedValue(secretError):jest.fn().mockResolvedValue({})};
    const queue={waitUntilReady:queueFails?jest.fn().mockRejectedValue(secretError):jest.fn().mockResolvedValue(undefined)};
    try{await new HealthController(db as never,queue as never).ready();throw new Error('Expected readiness failure');}
    catch(error){
      expect((error as {getResponse:()=>unknown}).getResponse()).toEqual({status:'error',checks:{database:dbFails?'down':'up',queue:queueFails?'down':'up'}});
      expect(JSON.stringify((error as {getResponse:()=>unknown}).getResponse())).not.toContain('secret');
    }
  });
  it('bounds a queue connection that never becomes ready',async()=>{
    jest.useFakeTimers();
    try{
      const db={query:jest.fn().mockResolvedValue({})};
      const queue={waitUntilReady:jest.fn(()=>new Promise(()=>undefined))};
      const result=expect(new HealthController(db as never,queue as never).ready()).rejects.toMatchObject({response:{checks:{database:'up',queue:'down'}}});
      await jest.advanceTimersByTimeAsync(3000);await result;
    }finally{jest.useRealTimers();}
  });
  it('reports only safe runtime integrity metadata', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ name: '052_notification_outbox.sql', applied_at: '2026-10-14T00:00:00Z' }] }) };
    const queue = { waitUntilReady: jest.fn().mockResolvedValue(undefined) };
    const controller = new HealthController(db as never, queue as never);
    await expect(controller.integrity()).resolves.toMatchObject({ status: 'ok', migration: { name: '052_notification_outbox.sql' }, dependencies: { database: 'up', queue: 'up' } });
  });
  it('summarizes reconciliation discrepancies without changing records', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ count: '0' }] }) };
    const controller = new HealthController(db as never, {} as never);
    await expect(controller.reconciliation()).resolves.toEqual({ status: 'ok', checks: { paymentsWithoutOrders: 0, paidOrdersWithoutPayments: 0, invalidInventory: 0, cancelledReservations: 0, unlinkedCollections: 0 } });
    expect(db.query).toHaveBeenCalledTimes(5);
  });
  it('shows release blockers without exposing any secret', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ count: '0' }] }) };
    const controller = new HealthController(db as never, { waitUntilReady: jest.fn().mockResolvedValue(undefined) } as never);
    await expect(controller.releaseReadiness()).resolves.toMatchObject({ status: 'attention', checks: { legalDocumentCount: 0 } });
  });
});
