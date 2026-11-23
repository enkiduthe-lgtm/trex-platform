import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DEFAULT_QUEUE } from './jobs.constants';
import { waitForQueueReady } from './queue-ready';
@Injectable()
export class JobsService implements OnModuleDestroy {
  constructor(@Inject(DEFAULT_QUEUE) private readonly queue: Queue) {}
  async onModuleDestroy() { await this.queue.close(); }
  async enqueue(name: string, payload: Record<string, unknown>,jobId?:string) {
    await waitForQueueReady(this.queue);
    // Pending notification records are recovered from SQL. A failed pre-claim job
    // must release its deterministic ID so the next recovery pass can enqueue it.
    return this.queue.add(name, payload, { jobId, removeOnComplete: 1000, removeOnFail: name==='notification.dispatch'?true:5000 });
  }
}
