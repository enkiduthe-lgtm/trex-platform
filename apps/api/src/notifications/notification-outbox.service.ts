import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { DatabaseService } from '../database/database.service';
import { normalizeRedisUrl } from '../config/environment';
import { DEFAULT_QUEUE } from '../jobs/jobs.constants';
import { BrevoEmailProvider } from './brevo-email.provider';

@Injectable()
export class NotificationOutboxService implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService, private readonly brevo: BrevoEmailProvider) {}

  onModuleInit() {
    this.worker = new Worker(DEFAULT_QUEUE, async (job: Job<{ notificationId: string }>) => {
      if (job.name !== 'notification.dispatch') return;
      const id = job.data.notificationId;
      const result = await this.db.query<{ channel: string; recipient: string; subject: string | null; body: string }>(
        "UPDATE notifications SET status='RETRYING',attempt_count=attempt_count+1,last_attempt_at=now() WHERE id=$1 AND status IN ('PENDING','RETRYING') RETURNING channel,recipient,subject,body",
        [id],
      );
      if (!result.rows[0]) return;
      if (result.rows[0].channel === 'IN_APP') {
        await this.db.query("UPDATE notifications SET status='SENT',sent_at=now(),failure_reason=NULL WHERE id=$1", [id]);
        return;
      }
      try {
        if (result.rows[0].channel === 'EMAIL' && process.env.NOTIFICATION_PROVIDER === 'brevo') {
          const delivery = await this.brevo.send({ recipient: result.rows[0].recipient, subject: result.rows[0].subject ?? 'TREX bildirimi', body: result.rows[0].body });
          await this.db.query("UPDATE notifications SET status='SENT',provider_reference=$1,sent_at=now(),failure_reason=NULL,next_attempt_at=NULL WHERE id=$2", [delivery.providerReference, id]);
          return;
        }
        throw new Error('Bu kanal için canlı sağlayıcı henüz bağlanmadı');
      } catch (error) {
        await this.db.query("UPDATE notifications SET status='FAILED',failure_reason=$1,next_attempt_at=NULL WHERE id=$2", [error instanceof Error ? error.message.slice(0, 500) : 'Bildirim gönderilemedi', id]);
      }
    }, { connection: { url: normalizeRedisUrl(this.config.getOrThrow<string>('REDIS_URL')) } });
  }

  async onModuleDestroy() { await this.worker?.close(); }
}
