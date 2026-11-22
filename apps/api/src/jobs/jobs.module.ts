import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { JobsService } from './jobs.service';
import { DEFAULT_QUEUE } from './jobs.constants';
import { normalizeRedisUrl } from '../config/environment';

@Global()
@Module({
  providers: [
    { provide: DEFAULT_QUEUE, inject: [ConfigService], useFactory: (config: ConfigService) => {
      const queue=new Queue(DEFAULT_QUEUE,{skipWaitingForReady:true,connection:{url:normalizeRedisUrl(config.getOrThrow<string>('REDIS_URL')),enableOfflineQueue:false,maxRetriesPerRequest:1}});
      queue.on('error',()=>new Logger('Jobs').warn('Görev kuyruğu bağlantısı kullanılamıyor'));
      return queue;
    } },
    JobsService,
  ],
  exports: [DEFAULT_QUEUE, JobsService],
})
export class JobsModule {}
