import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';

@Injectable()
export class SettingsService {
  constructor(private readonly db: DatabaseService) {}
  async get() {
    const result = await this.db.query<{ settings: Record<string, unknown> }>('SELECT settings FROM admin_settings WHERE singleton=true');
    return result.rows[0]?.settings ?? {};
  }
  async update(settings: Record<string, unknown>, actor: RequestUser) {
    await this.db.transaction(async client => {
      const previous = await client.query<{ settings: Record<string, unknown> }>('SELECT settings FROM admin_settings WHERE singleton=true FOR UPDATE');
      const merged = { ...(previous.rows[0]?.settings ?? {}), ...settings };
      await client.query('UPDATE admin_settings SET settings=$1,updated_at=now(),updated_by=$2 WHERE singleton=true', [JSON.stringify(merged), actor.id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,metadata) VALUES($1,$2,$3,$4)', [actor.id, 'settings.updated', 'admin_settings', JSON.stringify({ keys: Object.keys(settings) })]);
    });
    return this.get();
  }
}
