import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DEFAULT_QUEUE } from './jobs.module';
@Injectable()
export class JobsService implements OnModuleDestroy {
  constructor(@Inject(DEFAULT_QUEUE) private readonly queue: Queue) {}
  async onModuleDestroy() { await this.queue.close(); }
  async enqueue(name: string, payload: Record<string, unknown>) { return this.queue.add(name, payload, { removeOnComplete: 1000, removeOnFail: 5000 }); }
}
