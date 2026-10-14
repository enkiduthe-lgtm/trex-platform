import { Controller, Get, Inject, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DatabaseService } from '../database/database.service';
import { DEFAULT_QUEUE } from '../jobs/jobs.constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService, @Inject(DEFAULT_QUEUE) private readonly queue: Queue) {}
  @Get('live') live() { return { status: 'ok' }; }
  @Get() async ready() {
    try { await Promise.all([this.db.query('SELECT 1'), this.queue.waitUntilReady()]); return { status: 'ok', checks: { database: 'up', queue: 'up' } }; }
    catch { throw new ServiceUnavailableException({ status: 'error', checks: { database: 'down or queue: down' } }); }
  }
  @Get('integrity') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
  async integrity() {
    try {
      const [migration] = await Promise.all([
        this.db.query<{ name: string; applied_at: string }>('SELECT name,applied_at FROM schema_migrations ORDER BY applied_at DESC,name DESC LIMIT 1'),
        this.queue.waitUntilReady(),
      ]);
      const paymentProvider = process.env.PAYMENT_PROVIDER ?? 'missing';
      const shippingProvider = process.env.SHIPPING_PROVIDER ?? 'missing';
      const notificationProvider = process.env.NOTIFICATION_PROVIDER ?? 'missing';
      return {
        status: 'ok',
        build: (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? 'local').slice(0, 12),
        environment: process.env.NODE_ENV ?? 'development',
        migration: migration.rows[0] ?? null,
        dependencies: { database: 'up', queue: 'up' },
        providers: {
          payment: { configured: paymentProvider !== 'missing' && paymentProvider !== 'mock', kind: paymentProvider },
          shipping: { configured: shippingProvider !== 'missing' && shippingProvider !== 'mock', kind: shippingProvider },
          notification: { configured: notificationProvider !== 'missing' && notificationProvider !== 'mock', kind: notificationProvider },
        },
      };
    } catch { throw new ServiceUnavailableException({ status: 'error', message: 'Çalışma zamanı bütünlüğü doğrulanamadı' }); }
  }
}
