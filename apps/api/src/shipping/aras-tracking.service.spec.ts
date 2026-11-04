import { ArasTrackingService } from './aras-tracking.service';

describe('Aras tracking orchestration', () => {
  function setup(observation: unknown = {reference:'REF',code:'6',direction:'1',status:'DELIVERED',description:'Aras: Teslim Edildi',trackingNumber:'123'}) {
    const client = { query: jest.fn().mockResolvedValue({rows:[]}) };
    client.query.mockResolvedValueOnce({rows:[{locked:true}]}).mockResolvedValueOnce({rows:[{id:'shipment',order_id:'order',provider_reference:'REF'}]});
    const db = {transaction:jest.fn(async(work:any)=>work(client))};
    const query = {configured:()=>true,query:jest.fn().mockResolvedValue(observation)};
    const shipping = {updateStatus:jest.fn().mockResolvedValue({})};
    return {client,db,query,shipping,service:new ArasTrackingService(db as never,query as never,shipping as never)};
  }
  it('applies only a verified observation through the atomic shipping transition', async () => {
    const s=setup(); expect(await s.service.sync()).toMatchObject({checked:1,updated:1,failed:0});
    expect(s.query.query).toHaveBeenCalledWith('REF');
    expect(s.shipping.updateStatus).toHaveBeenCalledWith('order',{status:'DELIVERED',description:'Aras: Teslim Edildi'},null,expect.objectContaining({reference:'REF',code:'6',direction:'1',eventId:expect.stringMatching(/^aras:/)}));
  });
  it('empty or erroneous responses never trigger status updates', async () => {
    const empty=setup(null); expect(await empty.service.sync()).toMatchObject({updated:0});expect(empty.shipping.updateStatus).not.toHaveBeenCalled();
    const invalid=setup();invalid.query.query.mockRejectedValue(new Error('secret-provider-response'));
    expect(await invalid.service.sync()).toMatchObject({failed:1,updated:0});expect(invalid.shipping.updateStatus).not.toHaveBeenCalled();
    expect(JSON.stringify(invalid.client.query.mock.calls)).not.toContain('secret-provider-response');
  });
  it('serializes overlapping instances and excludes canceled or finished orders', async () => {
    const s=setup();s.client.query.mockReset().mockResolvedValue({rows:[{locked:false}]});
    expect(await s.service.sync()).toMatchObject({busy:true,checked:0});expect(s.query.query).not.toHaveBeenCalled();
    const active=setup();await active.service.sync();expect(active.client.query.mock.calls[1][0]).toContain("o.status IN ('PROCESSING','SHIPPED')");
  });
  it('does not connect without query credentials or for an unauthorized caller', async () => {
    const s=setup();s.query.configured=()=>false;expect(await s.service.sync()).toMatchObject({configured:false});expect(s.db.transaction).not.toHaveBeenCalled();
    await expect(s.service.sync(undefined,{role:'ADMIN'} as never)).rejects.toThrow();expect(s.db.transaction).not.toHaveBeenCalled();
  });
});
