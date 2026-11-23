import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { Queue } from 'bullmq';
import { JobsService } from './jobs.service';
import { JobsModule } from './jobs.module';
import { DEFAULT_QUEUE } from './jobs.constants';

jest.mock('bullmq',()=>({Queue:jest.fn().mockImplementation(()=>({on:jest.fn(),close:jest.fn()}))}));
describe('Notification queue producers',()=>{
  it('preserves deterministic job IDs and bounded retention',async()=>{
    const queue={waitUntilReady:jest.fn().mockResolvedValue(undefined),add:jest.fn().mockResolvedValue({id:'stable-job'}),close:jest.fn().mockResolvedValue(undefined)};
    const service=new JobsService(queue as never);await service.enqueue('notification.dispatch',{notificationId:'id'},'stable-job');
    expect(queue.add).toHaveBeenCalledWith('notification.dispatch',{notificationId:'id'},{jobId:'stable-job',removeOnComplete:1000,removeOnFail:true});
    await service.enqueue('another-task',{},'other-job');expect(queue.add).toHaveBeenLastCalledWith('another-task',{},{jobId:'other-job',removeOnComplete:1000,removeOnFail:5000});
    await service.onModuleDestroy();expect(queue.close).toHaveBeenCalledTimes(1);
  });
  it('fails producer calls quickly while workers retain their own reconnect policy',()=>{
    const providers=Reflect.getMetadata('providers',JobsModule);const producer=providers.find((provider:{provide:string})=>provider.provide===DEFAULT_QUEUE);
    producer.useFactory({getOrThrow:()=> 'redis://localhost:6379'});
    expect((Queue as unknown as jest.Mock).mock.calls.at(-1)?.[1]).toMatchObject({connection:{enableOfflineQueue:false,maxRetriesPerRequest:1}});
  });
  it('waits for the Redis handshake before issuing initialization commands',async()=>{
    const {RedisConnection}=jest.requireActual('bullmq');
    const previousFactory=RedisConnection.clientFactory;
    const client=Object.assign(new EventEmitter(),{
      status:'connecting',isCluster:false,options:{},
      defineCommand:jest.fn(),
      info:jest.fn(async()=>{
        if(client.status!=='ready')throw new Error('Stream is not writeable and enableOfflineQueue options is false');
        return 'redis_version:7.2.0\r\nmaxmemory_policy:noeviction\r\n';
      }),
      quit:jest.fn(async()=>{client.status='end';client.emit('end');}),
      disconnect:jest.fn(),
    });
    RedisConnection.clientFactory=()=>client;
    const providers=Reflect.getMetadata('providers',JobsModule);
    providers.find((provider:{provide:string})=>provider.provide===DEFAULT_QUEUE).useFactory({getOrThrow:()=> 'redis://example.invalid:6379'});
    const options=(Queue as unknown as jest.Mock).mock.calls.at(-1)?.[1];
    const connection=new RedisConnection(options.connection,{blocking:false,skipWaitingForReady:options.skipWaitingForReady});
    connection.on('error',()=>undefined);
    try{
      const initialized=connection.client;
      await Promise.resolve();
      client.status='ready';client.emit('ready');
      await expect(initialized).resolves.toBe(client);
    }finally{
      await connection.close(true);
      RedisConnection.clientFactory=previousFactory;
    }
  });
  it('does not enqueue a delayed job after readiness times out',async()=>{
    jest.useFakeTimers();
    let connect!:()=>void;
    const queue={waitUntilReady:jest.fn(()=>new Promise<void>(resolve=>{connect=resolve;})),add:jest.fn()};
    try{
      const pending=new JobsService(queue as never).enqueue('notification.dispatch',{},'stable');
      const result=expect(pending).rejects.toThrow('Görev kuyruğu hazır değil');
      await jest.advanceTimersByTimeAsync(3000);await result;
      connect();await Promise.resolve();
      expect(queue.add).not.toHaveBeenCalled();
    }finally{jest.useRealTimers();}
  });
});
