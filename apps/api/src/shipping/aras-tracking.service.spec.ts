import { ArasTrackingService } from './aras-tracking.service';

describe('Aras tracking orchestration',()=>{
  const observation={reference:'REF',code:'6',direction:'1',status:'DELIVERED',description:'Aras: Teslim Edildi',trackingNumber:'123'};
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  function setup(result:unknown=observation){
    let owned=true;const rows=[{id:'shipment',order_id:'order',provider_reference:'REF'}];
    const db={transaction:jest.fn(()=>{throw Error('Tracking must not keep a transaction open');}),query:jest.fn(async(sql:string,args?:unknown[])=>{
      if(sql.startsWith('INSERT INTO background_job_leases'))return {rows:owned?[{owner_token:args?.[1]}]:[],rowCount:owned?1:0};
      if(sql.startsWith('UPDATE background_job_leases'))return {rows:owned?[{name:'trex.aras.tracking'}]:[],rowCount:owned?1:0};
      if(sql.startsWith('SELECT s.id'))return {rows,rowCount:rows.length};
      return {rows:[],rowCount:1};
    })};
    const query={configured:()=>true,query:jest.fn().mockResolvedValue(result)},shipping={updateStatus:jest.fn().mockResolvedValue({})};
    return {rows,db,query,shipping,service:new ArasTrackingService(db as never,query as never,shipping as never),loseLease:()=>{owned=false;}};
  }
  it('releases query connections before carrier I/O and applies the verified observation atomically',async()=>{
    const s=setup();expect(await s.service.sync()).toMatchObject({checked:1,updated:1,failed:0});
    expect(s.db.transaction).not.toHaveBeenCalled();expect(s.query.query).toHaveBeenCalledWith('REF');
    expect(s.shipping.updateStatus).toHaveBeenCalledWith('order',{status:'DELIVERED',description:'Aras: Teslim Edildi'},null,expect.objectContaining({reference:'REF',code:'6',direction:'1',eventId:expect.stringMatching(/^aras:/),leaseToken:expect.stringMatching(/^[0-9a-f-]{36}$/)}));
    const token=s.db.query.mock.calls[0][1]?.[1];expect(s.db.query).toHaveBeenLastCalledWith('DELETE FROM background_job_leases WHERE name=$1 AND owner_token=$2',['trex.aras.tracking',token]);
  });
  it('records empty or failed provider reads without exposing the response',async()=>{
    const empty=setup(null);expect(await empty.service.sync()).toMatchObject({updated:0});expect(empty.shipping.updateStatus).not.toHaveBeenCalled();
    const invalid=setup();invalid.query.query.mockRejectedValue(Error('secret-provider-response'));expect(await invalid.service.sync()).toMatchObject({failed:1,updated:0});expect(invalid.shipping.updateStatus).not.toHaveBeenCalled();
    expect(invalid.db.query).toHaveBeenCalledWith(expect.stringContaining('provider_reference=$2'),['shipment','REF',expect.stringContaining('Kontrolü Tamamlanamadı'),'trex.aras.tracking',expect.any(String)]);
    expect(JSON.stringify(invalid.db.query.mock.calls)).not.toContain('secret-provider-response');
  });
  it('does not query the carrier while another instance owns the lease',async()=>{
    const s=setup();s.loseLease();expect(await s.service.sync()).toMatchObject({busy:true,checked:0});expect(s.query.query).not.toHaveBeenCalled();expect(s.db.query).toHaveBeenCalledTimes(1);
  });
  it('excludes canceled, archived, returned and finished orders from polling',async()=>{
    const s=setup();await s.service.sync();const sql=s.db.query.mock.calls.find(([text])=>text.startsWith('SELECT s.id'))?.[0];
    expect(sql).toContain("o.status IN ('PROCESSING','SHIPPED')");expect(sql).toContain("s.tracking_direction_code IS DISTINCT FROM '3'");expect(sql).toContain('o.archived_at IS NULL');expect(sql).toContain("s.status IN ('CREATED','IN_TRANSIT','FAILED','DELIVERED')");
  });
  it('rejects same-instance overlap while a carrier response is pending',async()=>{
    const s=setup();let release!:(value:unknown)=>void;s.query.query.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const first=s.service.sync();await flush();expect(release).toBeDefined();
    const before=s.db.query.mock.calls.length;expect(await s.service.sync()).toMatchObject({busy:true,checked:0});expect(s.db.query).toHaveBeenCalledTimes(before);release(observation);await first;
  });
  it('discards a carrier response after lease ownership is lost',async()=>{
    const s=setup();let release!:(value:unknown)=>void;s.query.query.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const run=s.service.sync();await flush();s.loseLease();release(observation);
    expect(await run).toMatchObject({busy:true,checked:1,updated:0});expect(s.shipping.updateStatus).not.toHaveBeenCalled();expect(s.db.query).toHaveBeenLastCalledWith(expect.stringContaining('owner_token=$2'),expect.any(Array));
  });
  it('stops applying observations when the module is destroyed',async()=>{
    const s=setup();let release!:(value:unknown)=>void;s.query.query.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const run=s.service.sync();await flush();s.service.onModuleDestroy();release(observation);
    expect(await run).toMatchObject({busy:true,updated:0});expect(s.shipping.updateStatus).not.toHaveBeenCalled();
  });
  it('releases the lease and resets local state after a selection failure',async()=>{
    const s=setup();const original=s.db.query.getMockImplementation()!;let fail=true;s.db.query.mockImplementation(async(sql,args)=>{if(fail&&sql.startsWith('SELECT s.id'))throw Error('Database unavailable');return original(sql,args);});
    await expect(s.service.sync()).rejects.toThrow('Database unavailable');expect(s.db.query).toHaveBeenLastCalledWith(expect.stringContaining('DELETE FROM background_job_leases'),expect.any(Array));fail=false;expect(await s.service.sync()).toMatchObject({checked:1,updated:1});
  });
  it('keeps a confirmed result when lease cleanup fails',async()=>{
    const s=setup();const original=s.db.query.getMockImplementation()!;s.db.query.mockImplementation(async(sql,args)=>{if(sql.startsWith('DELETE FROM background_job_leases'))throw Error('private-connection');return original(sql,args);});
    await expect(s.service.sync()).resolves.toMatchObject({updated:1});expect(s.shipping.updateStatus).toHaveBeenCalledTimes(1);
  });
  it('does not connect without credentials or for an unauthorized caller',async()=>{
    const s=setup();s.query.configured=()=>false;expect(await s.service.sync()).toMatchObject({configured:false});expect(s.db.query).not.toHaveBeenCalled();await expect(s.service.sync(undefined,{role:'ADMIN'} as never)).rejects.toThrow();expect(s.db.query).not.toHaveBeenCalled();
  });
  it('retains the director actor and explicit order selection',async()=>{
    const s=setup();await s.service.sync('selected-order',{id:'director',role:'SUPER_ADMIN'} as never);
    expect(s.db.query).toHaveBeenCalledWith(expect.stringContaining('s.order_id=$1'),['selected-order']);expect(s.shipping.updateStatus.mock.calls[0][2]).toBe('director');
  });
  it('starts and stops the existing free in-process schedule',async()=>{
    const prior=process.env.ARAS_TRACKING_ENABLED;process.env.ARAS_TRACKING_ENABLED='true';jest.useFakeTimers();
    try{const s=setup();s.rows.length=0;s.service.onModuleInit();await jest.advanceTimersByTimeAsync(0);expect(s.db.query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO background_job_leases'))).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(300_000);expect(s.db.query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO background_job_leases'))).toHaveLength(2);s.service.onModuleDestroy();const before=s.db.query.mock.calls.length;await jest.advanceTimersByTimeAsync(600_000);expect(s.db.query).toHaveBeenCalledTimes(before);
    }finally{if(prior===undefined)delete process.env.ARAS_TRACKING_ENABLED;else process.env.ARAS_TRACKING_ENABLED=prior;jest.useRealTimers();}
  });
});
