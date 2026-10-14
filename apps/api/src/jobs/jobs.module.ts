import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { JobsService } from './jobs.service';
import { DEFAULT_QUEUE } from './jobs.constants';
import { normalizeRedisUrl } from '../config/environment';

@Global()
@Module({
  providers: [
    { provide: DEFAULT_QUEUE, inject: [ConfigService], useFactory: (config: ConfigService) => new Queue(DEFAULT_QUEUE, { connection: { url: normalizeRedisUrl(config.getOrThrow<string>('REDIS_URL')) } }) },
    JobsService,
  ],
  exports: [DEFAULT_QUEUE, JobsService],
})
export class JobsModule {}
