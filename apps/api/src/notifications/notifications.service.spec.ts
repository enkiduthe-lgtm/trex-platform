import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationChannel } from './dto/create-notification.dto';

describe('Notification records and queue recovery',()=>{
  const keys=['NODE_ENV','NOTIFICATION_PROVIDER','BREVO_API_KEY','BREVO_FROM_EMAIL'] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  beforeEach(()=>{process.env.NODE_ENV='test';process.env.NOTIFICATION_PROVIDER='brevo';process.env.BREVO_API_KEY='provider-secret-test';process.env.BREVO_FROM_EMAIL='sender@example.test';});
  afterEach(()=>{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
  function setup(){
    let row:any=null,committed=false;
    const client={query:jest.fn(async(sql:string,args:any[]=[])=>{
      if(sql.includes('INSERT INTO notifications')){row={id:'notification',channel:args[2],status:args[6],delivery_mode:args[7],provider_reference:args[8],attempt_count:0};return {rows:[row],rowCount:1};}
      if(sql.startsWith('SELECT id,channel,status,delivery_mode'))return {rows:row?[row]:[],rowCount:row?1:0};
      if(sql.startsWith('UPDATE notifications SET status=')){row={...row,status:args[1]};return {rows:[],rowCount:1};}
      return {rows:[],rowCount:0};
    })};
    const db={query:jest.fn(async(sql:string)=>sql.startsWith('SELECT id,channel,status')?{rows:row?[row]:[],rowCount:row?1:0}:{rows:[],rowCount:1}),transaction:jest.fn(async(work:any)=>{committed=false;const result=await work(client);committed=true;return result;})};
    const jobs={enqueue:jest.fn(async()=>{expect(committed).toBe(true);return {id:'job'};})};
    return {db,client,jobs,service:new NotificationsService(db as never,jobs as never),setRow:(value:any)=>{row=value;}};
  }
  const dto={channel:NotificationChannel.EMAIL,recipient:'recipient@example.test',subject:'Test',body:'Test mesajı'};
  it('stores simulation results without queueing a possible real delivery',async()=>{
    const s=setup();await expect(s.service.sendMock(dto)).resolves.toMatchObject({status:'SENT',mode:'MOCK',simulated:true,queueState:'NOT_NEEDED'});
    expect(s.jobs.enqueue).not.toHaveBeenCalled();expect(s.db.transaction).toHaveBeenCalledTimes(1);
  });
  it('rejects simulated delivery in production before writing',async()=>{
    process.env.NODE_ENV='production';const s=setup();await expect(s.service.sendMock(dto)).rejects.toThrow('disabled in production');expect(s.db.transaction).not.toHaveBeenCalled();
  });
  it('stores in-app records without requiring an external provider',async()=>{
    process.env.NODE_ENV='production';process.env.NOTIFICATION_PROVIDER='unconfigured';delete process.env.BREVO_API_KEY;
    const s=setup();await expect(s.service.send({...dto,channel:NotificationChannel.IN_APP,recipient:'Yönetim'})).resolves.toMatchObject({status:'SENT',mode:'IN_APP',simulated:false});expect(s.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('enqueues a real email only after its record is committed',async()=>{
    const s=setup();await expect(s.service.send(dto)).resolves.toMatchObject({status:'PENDING',mode:'BREVO',queueState:'QUEUED'});
    expect(s.jobs.enqueue).toHaveBeenCalledWith('notification.dispatch',{notificationId:'notification'},'notification-notification-1');
  });
  it('retains a confirmed record when the queue is unavailable',async()=>{
    const s=setup();s.jobs.enqueue.mockRejectedValueOnce(new Error('redis://private-secret'));
    await expect(s.service.send(dto)).resolves.toMatchObject({id:'notification',queueState:'WAITING'});
    expect(s.db.query.mock.calls.some(([sql])=>sql.includes('kayıt korunuyor'))).toBe(true);
    expect(JSON.stringify(s.db.query.mock.calls)).not.toContain('private-secret');
  });
  it('exposes channel readiness without credentials or sender addresses',()=>{
    const result=new NotificationsService({} as never,{} as never).configuration();
    expect(result.channels.find(item=>item.channel==='EMAIL')?.available).toBe(true);
    expect(result.channels.find(item=>item.channel==='SMS')?.available).toBe(false);
    expect(JSON.stringify(result)).not.toContain('provider-secret-test');expect(JSON.stringify(result)).not.toContain('sender@example.test');
  });
  it.each([{...dto,body:' '},{...dto,recipient:' '},{...dto,recipient:'not-an-email'},{...dto,channel:NotificationChannel.SMS}])('rejects unsupported or invalid messages before an insert',async value=>{
    const s=setup();await expect(s.service.send(value)).rejects.toThrow();expect(s.client.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO notifications'))).toBe(false);
  });
  it('requires a recovery key on the idempotent call',async()=>{
    const s=setup();await expect(s.service.send(dto,undefined,{actorId:'actor',key:''})).rejects.toBeInstanceOf(BadRequestException);expect(s.db.transaction).not.toHaveBeenCalled();
  });
  it('retries only a failed, configured real-email record',async()=>{
    const s=setup();s.setRow({id:'notification',channel:'EMAIL',delivery_mode:'BREVO',status:'FAILED',attempt_count:3});
    await expect(s.service.retry('notification')).resolves.toMatchObject({id:'notification',status:'PENDING',queued:true});
    expect(s.jobs.enqueue).toHaveBeenCalledWith('notification.dispatch',{notificationId:'notification'},'notification-notification-4');
  });
  it('does not blindly resend an email with an unknown result',async()=>{
    const s=setup();s.setRow({id:'notification',channel:'EMAIL',delivery_mode:'BREVO',status:'UNKNOWN'});
    await expect(s.service.retry('notification')).rejects.toThrow('doğrulanmadan');expect(s.jobs.enqueue).not.toHaveBeenCalled();expect(s.client.query).toHaveBeenCalledTimes(1);
  });
  it('does not convert a simulated record into a real email',async()=>{
    const s=setup();s.setRow({id:'notification',channel:'EMAIL',delivery_mode:'MOCK',status:'FAILED'});
    await expect(s.service.retry('notification')).rejects.toThrow();expect(s.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('allows an uncertain in-app record to be saved without external delivery',async()=>{
    const s=setup();s.setRow({id:'notification',channel:'IN_APP',delivery_mode:'IN_APP',status:'UNKNOWN'});
    await expect(s.service.retry('notification')).resolves.toMatchObject({status:'SENT',queued:false});expect(s.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('ignores retry clicks against a record already in the queue',async()=>{
    const s=setup();s.setRow({id:'notification',channel:'EMAIL',delivery_mode:'BREVO',status:'PENDING'});
    await expect(s.service.retry('notification')).resolves.toBeNull();expect(s.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('does not manually resend a security link from notification history',async()=>{
    const s=setup();s.setRow({id:'notification',channel:'EMAIL',delivery_mode:'BREVO',status:'FAILED',is_sensitive:true});
    await expect(s.service.retry('notification')).rejects.toThrow('tekrar gönderilemez');
    expect(s.jobs.enqueue).not.toHaveBeenCalled();
    expect(s.client.query).toHaveBeenCalledTimes(1);
  });
});
