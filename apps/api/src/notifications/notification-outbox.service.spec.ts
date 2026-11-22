import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationDeliveryError } from './notification-delivery-error';
import { Worker } from 'bullmq';

jest.mock('bullmq',()=>({Worker:jest.fn().mockImplementation(()=>({on:jest.fn(),close:jest.fn().mockResolvedValue(undefined)})),Queue:class{}}));

describe('Exclusive notification delivery claims',()=>{
  const id='00000000-0000-4000-8000-000000000001',saved={node:process.env.NODE_ENV,provider:process.env.NOTIFICATION_PROVIDER};
  beforeEach(()=>{process.env.NODE_ENV='test';process.env.NOTIFICATION_PROVIDER='brevo';});
  afterEach(()=>{if(saved.node===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=saved.node;if(saved.provider===undefined)delete process.env.NOTIFICATION_PROVIDER;else process.env.NOTIFICATION_PROVIDER=saved.provider;jest.useRealTimers();});
  function setup(row:any={channel:'EMAIL',recipient:'recipient@example.test',subject:'Test',body:'Test',delivery_mode:'BREVO'}){
    const query=jest.fn().mockResolvedValueOnce({rows:row?[row]:[],rowCount:row?1:0}).mockResolvedValue({rows:[],rowCount:1});
    const brevo={send:jest.fn().mockResolvedValue({providerReference:'provider-reference'})};
    const service=new NotificationOutboxService({query} as never,{} as never,brevo as never);
    return {service,query,brevo};
  }
  it('claims only pending records and binds the acknowledgement to its token',async()=>{
    const s=setup();await expect(s.service.dispatch(id)).resolves.toMatchObject({claimed:true,status:'SENT'});
    expect(s.query.mock.calls[0][0]).toContain("WHERE id=$1 AND status='PENDING'");expect(s.query.mock.calls[0][0]).not.toContain("status IN ('PENDING','RETRYING')");
    const token=s.query.mock.calls[0][1][1];expect(s.brevo.send.mock.calls[0][0].idempotencyKey).toBe(token);expect(s.query.mock.calls[1][0]).toContain('delivery_token=$2');expect(s.query.mock.calls[1][1]).toEqual([id,token,'SENT','provider-reference',null]);
  });
  it('does not deliver a duplicate job when no claim is available',async()=>{
    const s=setup(null);await expect(s.service.dispatch(id)).resolves.toEqual({claimed:false});expect(s.brevo.send).not.toHaveBeenCalled();expect(s.query).toHaveBeenCalledTimes(1);
  });
  it.each([false,true])('distinguishes definite rejection from uncertainty: %s',async uncertain=>{
    const s=setup();s.brevo.send.mockRejectedValue(new NotificationDeliveryError('Controlled failure',uncertain));await expect(s.service.dispatch(id)).resolves.toMatchObject({status:uncertain?'UNKNOWN':'FAILED'});expect(s.query.mock.calls[1][1][2]).toBe(uncertain?'UNKNOWN':'FAILED');
  });
  it('does not expose unexpected provider errors or label them safe to resend',async()=>{
    const s=setup();s.brevo.send.mockRejectedValue(Error('private-provider-secret'));await expect(s.service.dispatch(id)).resolves.toMatchObject({status:'UNKNOWN'});expect(JSON.stringify(s.query.mock.calls)).not.toContain('private-provider-secret');
  });
  it('does not turn an unverified legacy email into a live send',async()=>{
    const s=setup({channel:'EMAIL',recipient:'recipient@example.test',body:'Test',delivery_mode:null});await expect(s.service.dispatch(id)).resolves.toMatchObject({status:'UNKNOWN'});expect(s.brevo.send).not.toHaveBeenCalled();
  });
  it('stores in-app results without an external provider',async()=>{
    const s=setup({channel:'IN_APP',recipient:'Yönetim',body:'Test',delivery_mode:null});await expect(s.service.dispatch(id)).resolves.toMatchObject({status:'SENT'});expect(s.brevo.send).not.toHaveBeenCalled();
  });
  it('refuses to run a simulated delivery as production mail',async()=>{
    process.env.NODE_ENV='production';const s=setup({channel:'EMAIL',recipient:'recipient@example.test',body:'Test',delivery_mode:'MOCK'});await expect(s.service.dispatch(id)).resolves.toMatchObject({status:'FAILED'});expect(s.brevo.send).not.toHaveBeenCalled();
  });
  it('does not query invalid notification IDs',async()=>{
    const s=setup();await expect(s.service.dispatch('invalid')).resolves.toMatchObject({claimed:false});expect(s.query).not.toHaveBeenCalled();
  });
  it('leaves provider untouched when the database claim fails',async()=>{
    const s=setup();s.query.mockReset().mockRejectedValueOnce(Error('private-database-uri'));
    await expect(s.service.dispatch(id)).rejects.toThrow('Bildirim kaydı işleme alınamadı');expect(s.brevo.send).not.toHaveBeenCalled();expect(s.query).toHaveBeenCalledTimes(1);
  });
  it('starts and stops pending recovery with the worker lifecycle',async()=>{
    jest.useFakeTimers();const pending={pumpPending:jest.fn().mockResolvedValue({checked:0})};const service=new NotificationOutboxService({} as never,{getOrThrow:()=> 'redis://localhost:6379'} as never,{} as never,pending as never);
    service.onModuleInit();await Promise.resolve();expect(pending.pumpPending).toHaveBeenCalledTimes(1);jest.advanceTimersByTime(30_000);await Promise.resolve();expect(pending.pumpPending).toHaveBeenCalledTimes(2);await service.onModuleDestroy();jest.advanceTimersByTime(60_000);expect(pending.pumpPending).toHaveBeenCalledTimes(2);expect((Worker as unknown as jest.Mock).mock.results.at(-1)?.value.close).toHaveBeenCalledTimes(1);
  });
});
