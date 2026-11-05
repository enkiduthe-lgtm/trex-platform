import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { ArasQueryProvider } from './aras-query.provider';
import { ShippingService } from './shipping.service';

@Injectable()
export class ArasTrackingService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(ArasTrackingService.name);
  constructor(private readonly db: DatabaseService, private readonly query: ArasQueryProvider, private readonly shipping: ShippingService) {}
  onModuleInit() {
    if (process.env.ARAS_TRACKING_ENABLED !== 'true' || !this.query.configured()) return;
    this.timer = setInterval(() => { void this.sync().catch(() => this.logger.warn('Aras Otomatik Takip Kontrolü Tamamlanamadı')); }, 300_000);
    this.timer.unref();
    void this.sync().catch(() => this.logger.warn('Aras İlk Takip Kontrolü Tamamlanamadı'));
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async sync(orderId?: string, actor?: RequestUser) {
    if (actor && actor.role !== 'SUPER_ADMIN') throw new ForbiddenException('Aras Kontrolünü Yalnız Müdür Başlatabilir');
    if (!this.query.configured()) return { configured: false, checked: 0, updated: 0, failed: 0 };
    if (this.running) return { busy: true, checked: 0, updated: 0, failed: 0 };
    this.running = true;
    try {
      return await this.db.transaction(async client => {
        // Cross-instance exclusion; network reads do not hold shipment/order row locks.
        const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext('trex.aras.tracking')) AS locked");
        if (!lock.rows[0]?.locked) return { busy: true, checked: 0, updated: 0, failed: 0 };
        const rows = await client.query<{ id: string; order_id: string; provider_reference: string }>(`SELECT s.id,s.order_id,s.provider_reference FROM shipments s JOIN orders o ON o.id=s.order_id
          WHERE s.provider='aras' AND s.status IN ('CREATED','IN_TRANSIT','FAILED') AND s.tracking_direction_code IS DISTINCT FROM '3'
          AND o.archived_at IS NULL AND o.status IN ('PROCESSING','SHIPPED') AND s.provider_reference IS NOT NULL
          AND ($1::uuid IS NULL OR s.order_id=$1)
          AND ($1::uuid IS NOT NULL OR s.tracking_checked_at IS NULL OR s.tracking_checked_at<now()-interval '5 minutes')
          ORDER BY s.tracking_checked_at NULLS FIRST,s.created_at,s.id LIMIT 20`, [orderId ?? null]);
        let checked = 0, updated = 0, failed = 0;
        for (const row of rows.rows) {
          checked++;
          try {
            const observation = await this.query.query(row.provider_reference);
            if (!observation) {
              await client.query("UPDATE shipments SET tracking_checked_at=now(),tracking_error='Aras Henüz Gönderi Hareketi Bildirmedi' WHERE id=$1", [row.id]);
              continue;
            }
            const eventId = 'aras:' + createHash('sha256').update(JSON.stringify([observation.reference, observation.code, observation.direction])).digest('hex');
            await this.shipping.updateStatus(row.order_id, { status: observation.status, description: observation.description }, actor?.id ?? null, { reference: observation.reference, eventId, code: observation.code, direction: observation.direction, trackingNumber: observation.trackingNumber });
            updated++;
          } catch {
            // Neither credentials nor the carrier's raw response enter logs or the UI.
            failed++;
            await client.query("UPDATE shipments SET tracking_checked_at=now(),tracking_error='Aras Kontrolü Tamamlanamadı; Son Kayıtlı Durumu Kontrol Edin' WHERE id=$1", [row.id]);
          }
        }
        return { configured: true, checked, updated, failed };
      });
    } finally { this.running = false; }
  }
}
