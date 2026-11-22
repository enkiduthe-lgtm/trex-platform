import 'reflect-metadata';
import { Queue } from 'bullmq';
import { JobsService } from './jobs.service';
import { JobsModule } from './jobs.module';
import { DEFAULT_QUEUE } from './jobs.constants';

jest.mock('bullmq',()=>({Queue:jest.fn().mockImplementation(()=>({on:jest.fn(),close:jest.fn()}))}));
describe('Notification queue producers',()=>{
  it('preserves deterministic job IDs and bounded retention',async()=>{
    const queue={add:jest.fn().mockResolvedValue({id:'stable-job'}),close:jest.fn().mockResolvedValue(undefined)};
    const service=new JobsService(queue as never);await service.enqueue('notification.dispatch',{notificationId:'id'},'stable-job');
    expect(queue.add).toHaveBeenCalledWith('notification.dispatch',{notificationId:'id'},{jobId:'stable-job',removeOnComplete:1000,removeOnFail:true});
    await service.enqueue('another-task',{},'other-job');expect(queue.add).toHaveBeenLastCalledWith('another-task',{},{jobId:'other-job',removeOnComplete:1000,removeOnFail:5000});
    await service.onModuleDestroy();expect(queue.close).toHaveBeenCalledTimes(1);
  });
  it('fails producer calls quickly while workers retain their own reconnect policy',()=>{
    const providers=Reflect.getMetadata('providers',JobsModule);const producer=providers.find((provider:{provide:string})=>provider.provide===DEFAULT_QUEUE);
    producer.useFactory({getOrThrow:()=> 'redis://localhost:6379'});
    expect((Queue as unknown as jest.Mock).mock.calls.at(-1)?.[1]).toMatchObject({skipWaitingForReady:true,connection:{enableOfflineQueue:false,maxRetriesPerRequest:1}});
  });
});
