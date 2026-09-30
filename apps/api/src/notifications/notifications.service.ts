import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}
  async sendMock(dto: CreateNotificationDto, userId?: string) {
    const inserted = await this.db.query<{ id: string }>('INSERT INTO notifications (user_id,channel,recipient,subject,body,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [userId ?? null, dto.channel, dto.recipient, dto.subject ?? null, dto.body, 'PENDING']);
    // Production adapters will enqueue this work and capture provider delivery IDs.
    const ref = `mock_notification_${randomUUID()}`;
    await this.db.query("UPDATE notifications SET status='SENT',provider_reference=$1,sent_at=now() WHERE id=$2", [ref, inserted.rows[0].id]);
    return { id: inserted.rows[0].id, status: 'SENT', providerReference: ref };
  }
}
