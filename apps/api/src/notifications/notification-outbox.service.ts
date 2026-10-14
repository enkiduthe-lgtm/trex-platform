import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { DatabaseService } from '../database/database.service';
import { normalizeRedisUrl } from '../config/environment';
import { DEFAULT_QUEUE } from '../jobs/jobs.constants';

@Injectable()
export class NotificationOutboxService implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}

  onModuleInit() {
    this.worker = new Worker(DEFAULT_QUEUE, async (job: Job<{ notificationId: string }>) => {
      if (job.name !== 'notification.dispatch') return;
      const id = job.data.notificationId;
      const result = await this.db.query<{ channel: string }>(
        "UPDATE notifications SET status='RETRYING',attempt_count=attempt_count+1,last_attempt_at=now() WHERE id=$1 AND status IN ('PENDING','RETRYING') RETURNING channel",
        [id],
      );
      if (!result.rows[0]) return;
      if (result.rows[0].channel === 'IN_APP') {
        await this.db.query("UPDATE notifications SET status='SENT',sent_at=now(),failure_reason=NULL WHERE id=$1", [id]);
        return;
      }
      await this.db.query("UPDATE notifications SET status='FAILED',failure_reason='Bu kanal için canlı sağlayıcı henüz bağlanmadı',next_attempt_at=NULL WHERE id=$1", [id]);
    }, { connection: { url: normalizeRedisUrl(this.config.getOrThrow<string>('REDIS_URL')) } });
  }

  async onModuleDestroy() { await this.worker?.close(); }
}
