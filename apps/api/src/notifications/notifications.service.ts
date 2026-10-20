import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { assertMockIntegrationAllowed } from '../config/mock-integration-policy';
import { JobsService } from '../jobs/jobs.service';
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService, private readonly jobs?: JobsService) {}
  private async enqueue(id: string) {
    await this.jobs?.enqueue('notification.dispatch', { notificationId: id });
  }
  async sendMock(dto: CreateNotificationDto, userId?: string) { assertMockIntegrationAllowed('NOTIFICATION_PROVIDER');
    const inserted = await this.db.query<{ id: string }>('INSERT INTO notifications (user_id,channel,recipient,subject,body,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [userId ?? null, dto.channel, dto.recipient, dto.subject ?? null, dto.body, 'PENDING']);
    await this.enqueue(inserted.rows[0].id);
    // Production adapters will enqueue this work and capture provider delivery IDs.
    const ref = `mock_notification_${randomUUID()}`;
    await this.db.query("UPDATE notifications SET status='SENT',provider_reference=$1,sent_at=now() WHERE id=$2", [ref, inserted.rows[0].id]);
    return { id: inserted.rows[0].id, status: 'SENT', providerReference: ref };
  }
  async send(dto: CreateNotificationDto, userId?: string) {
    if ((process.env.NOTIFICATION_PROVIDER ?? 'mock') === 'mock') return this.sendMock(dto, userId);
    const inserted = await this.db.query<{ id: string }>('INSERT INTO notifications (user_id,channel,recipient,subject,body,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [userId ?? null, dto.channel, dto.recipient, dto.subject ?? null, dto.body, 'PENDING']);
    await this.enqueue(inserted.rows[0].id);
    return { id: inserted.rows[0].id, status: 'PENDING' };
  }
  async list() { return (await this.db.query('SELECT id,channel,recipient,subject,body,status,sent_at,created_at,attempt_count,last_attempt_at,next_attempt_at,failure_reason FROM notifications ORDER BY created_at DESC LIMIT 100')).rows; }
  async retry(id: string) {
    const result = await this.db.query<{ id: string }>("UPDATE notifications SET status='PENDING', failure_reason=NULL, next_attempt_at=now() WHERE id=$1 AND status='FAILED' RETURNING id", [id]);
    if (!result.rows[0]) return null;
    await this.enqueue(id);
    return { id, status: 'PENDING' };
  }
  async recordOrderStatus(recipient: string | null, orderNumber: string, status: 'SHIPPED' | 'DELIVERED' | 'DELIVERY_EXCEPTION') {
    if (!recipient) return;
    const copy = status === 'SHIPPED'
      ? { subject: 'Siparişiniz kargoya verildi', body: `Siparişiniz kargoya verildi. Sipariş no: ${orderNumber}.` }
      : status === 'DELIVERED'
        ? { subject: 'Siparişiniz teslim edildi', body: `Siparişiniz teslim edildi. Sipariş no: ${orderNumber}.` }
        : { subject: 'Siparişinizin teslimatında sorun var', body: `Siparişinizin teslimatında bir sorun bildirildi. Sipariş no: ${orderNumber}. Lütfen destek ekibiyle iletişime geçin.` };
    await this.db.query(
      "INSERT INTO notifications (channel,recipient,template_code,subject,body,status,provider_reference,sent_at) VALUES ('IN_APP',$1,'ORDER_STATUS',$2,$3,'SENT',$4,now())",
      [recipient, copy.subject, copy.body, `system_order_${status.toLowerCase()}_${orderNumber}`],
    );
  }
}
