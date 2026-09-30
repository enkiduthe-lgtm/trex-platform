import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { JobsService } from './jobs.service';

export const DEFAULT_QUEUE = 'trex-default';
@Global()
@Module({
  providers: [
    { provide: DEFAULT_QUEUE, inject: [ConfigService], useFactory: (config: ConfigService) => new Queue(DEFAULT_QUEUE, { connection: { url: config.getOrThrow<string>('REDIS_URL') } }) },
    JobsService,
  ],
  exports: [DEFAULT_QUEUE, JobsService],
})
export class JobsModule {}
