import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DatabaseService } from '../database/database.service';
import { DEFAULT_QUEUE } from '../jobs/jobs.module';
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService, @Inject(DEFAULT_QUEUE) private readonly queue: Queue) {}
  @Get('live') live() { return { status: 'ok' }; }
  @Get() async ready() {
    try { await Promise.all([this.db.query('SELECT 1'), this.queue.waitUntilReady()]); return { status: 'ok', checks: { database: 'up', queue: 'up' } }; }
    catch { throw new ServiceUnavailableException({ status: 'error', checks: { database: 'down or queue: down' } }); }
  }
}
