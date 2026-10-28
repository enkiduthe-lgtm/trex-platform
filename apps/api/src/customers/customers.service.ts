import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type LoyaltyAdjustment = { points: number; reason: string };
type CustomerRequestInput = { subject: string; body: string; priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' };
type RequestStatusInput = { status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; resolutionNote?: string };
type CustomerTagInput = { name: string; color?: string };

@Injectable()
export class CustomersService {
  constructor(private readonly db: DatabaseService) {}

  async list() {
    return (await this.db.query(`
      WITH currency_totals AS (
        SELECT customer_id,currency,COUNT(*)::int AS order_count,SUM(total_amount) AS amount
        FROM orders WHERE status <> 'CANCELLED' GROUP BY customer_id,currency
      ), order_totals AS (
        SELECT customer_id,SUM(order_count)::int AS order_count,
          COALESCE(SUM(amount) FILTER (WHERE currency='TRY'),0)::text AS total_spend,
          jsonb_agg(jsonb_build_object('currency',currency,'amount',amount::text,'order_count',order_count) ORDER BY currency) AS totals_by_currency
        FROM currency_totals GROUP BY customer_id
      )
      SELECT c.id,c.email,c.first_name,c.last_name,c.phone,c.is_active,c.created_at,
        COALESCE(o.order_count,0)::int AS order_count,COALESCE(o.total_spend,'0') AS total_spend,
        COALESCE(o.totals_by_currency,'[]'::jsonb) AS totals_by_currency,COALESCE(n.note_count,0)::int AS note_count,
        COALESCE(l.points_balance,0)::int AS loyalty_points,COALESCE(l.tier,'BRONZE') AS loyalty_tier,
        COALESCE(t.tags,'[]'::jsonb) AS tags
      FROM customers c LEFT JOIN order_totals o ON o.customer_id=c.id
      LEFT JOIN (SELECT customer_id,COUNT(*) AS note_count FROM customer_notes GROUP BY customer_id) n ON n.customer_id=c.id
      LEFT JOIN customer_loyalty_accounts l ON l.customer_id=c.id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('id',ct.id,'name',ct.name,'color',ct.color) ORDER BY ct.name) AS tags
        FROM customer_tag_assignments cta JOIN customer_tags ct ON ct.id=cta.tag_id
        WHERE cta.customer_id=c.id
      ) t ON true
      ORDER BY c.created_at DESC`)).rows;
  }

  async listTags() {
    return (await this.db.query('SELECT id,name,color,created_at FROM customer_tags ORDER BY name')).rows;
  }

  async createTag(dto: CustomerTagInput, userId: string) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Etiket adı boş olamaz');
    return this.db.transaction(async client => {
      try {
        const result = await client.query<{ id: string; name: string; color: string }>(
          'INSERT INTO customer_tags(name,color) VALUES($1,$2) RETURNING id,name,color',
          [name, dto.color ?? '#7c3aed'],
        );
        await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [userId, 'customer.tag.created', 'customer_tag', result.rows[0].id, JSON.stringify({ name })]);
        return result.rows[0];
      } catch (error: unknown) {
        if ((error as { code?: string }).code === '23505') throw new ConflictException('Bu etiket zaten var');
        throw error;
      }
    });
  }

  async assignTag(customerId: string, tagId: string, userId: string) {
    return this.db.transaction(async client => {
      const customer = await client.query('SELECT 1 FROM customers WHERE id=$1 FOR KEY SHARE', [customerId]);
      if (!customer.rowCount) throw new NotFoundException('Customer not found');
      const tag = await client.query<{ id: string; name: string; color: string }>('SELECT id,name,color FROM customer_tags WHERE id=$1 FOR KEY SHARE', [tagId]);
      if (!tag.rowCount) throw new NotFoundException('Customer tag not found');
      const inserted = await client.query('INSERT INTO customer_tag_assignments(customer_id,tag_id,assigned_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING tag_id', [customerId, tagId, userId]);
      if (inserted.rowCount) await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [userId, 'customer.tag.assigned', 'customer', customerId, JSON.stringify({ tagId, tag: tag.rows[0].name })]);
      return tag.rows[0];
    });
  }

  async removeTag(customerId: string, tagId: string, userId: string) {
    return this.db.transaction(async client => {
      const removed = await client.query('DELETE FROM customer_tag_assignments WHERE customer_id=$1 AND tag_id=$2 RETURNING tag_id', [customerId, tagId]);
      if (!removed.rowCount) throw new NotFoundException('Customer tag assignment not found');
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [userId, 'customer.tag.removed', 'customer', customerId, JSON.stringify({ tagId })]);
      return { removed: true };
    });
  }

  async addNote(customerId: string, body: string, userId: string) {
    const note = body.trim();
    if (!note) throw new BadRequestException('Müşteri notu boş olamaz');
    return this.db.transaction(async client => {
      const customer = await client.query('SELECT 1 FROM customers WHERE id=$1 FOR KEY SHARE', [customerId]);
      if (!customer.rowCount) throw new NotFoundException('Customer not found');
      const result = await client.query<{ id: string }>('INSERT INTO customer_notes (customer_id,body,created_by) VALUES ($1,$2,$3) RETURNING id', [customerId, note, userId]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [userId, 'customer.note.created', 'customer', customerId]);
      return result.rows[0];
    });
  }

  async notes(customerId: string) {
    return (await this.db.query('SELECT id,body,created_at FROM customer_notes WHERE customer_id=$1 ORDER BY created_at DESC', [customerId])).rows;
  }

  async orders(customerId: string) {
    return (await this.db.query(`SELECT o.id,o.order_number,o.status,o.total_amount,o.currency,o.created_at,COALESCE(SUM(oi.quantity),0)::int AS item_count
      FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
      WHERE o.customer_id=$1 GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50`, [customerId])).rows;
  }

  async orderReport(customerId: string, dateFrom?: string, dateTo?: string) {
    return (await this.db.query(`SELECT o.order_number,o.created_at,o.status,o.currency,o.sales_channel,
      oi.product_name,oi.sku,oi.quantity,oi.unit_amount,(oi.quantity*oi.unit_amount)::text AS line_total,
      COALESCE(p.provider,'') AS payment_method
      FROM orders o JOIN order_items oi ON oi.order_id=o.id
      LEFT JOIN payments p ON p.checkout_id=o.checkout_id
      WHERE o.customer_id=$1
        AND ($2::date IS NULL OR o.created_at >= $2::date)
        AND ($3::date IS NULL OR o.created_at < ($3::date + interval '1 day'))
      ORDER BY o.created_at DESC,oi.id`, [customerId, dateFrom || null, dateTo || null])).rows;
  }

  async supportTickets(customerId: string) {
    return (
      await this.db.query(
        `SELECT t.id,t.ticket_number,t.subject,t.status,t.priority,t.due_at,t.created_at,o.order_number
         FROM support_tickets t
         LEFT JOIN orders o ON o.id=t.order_id
         WHERE t.customer_id=$1
         ORDER BY CASE WHEN t.status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER') AND t.due_at<now() THEN 0 ELSE 1 END,t.created_at DESC
         LIMIT 50`,
        [customerId],
      )
    ).rows;
  }

  async loyalty(customerId: string) {
    const account = await this.db.query('SELECT points_balance,tier,updated_at FROM customer_loyalty_accounts WHERE customer_id=$1', [customerId]);
    const movements = await this.db.query('SELECT id,points_delta,reason,created_at FROM customer_loyalty_movements WHERE customer_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100', [customerId]);
    return { pointsBalance: account.rows[0]?.points_balance ?? 0, tier: account.rows[0]?.tier ?? 'BRONZE', movements: movements.rows };
  }

  async adjustLoyalty(customerId: string, dto: LoyaltyAdjustment, userId: string) {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Puan işlem nedeni zorunludur');
    if (!Number.isInteger(dto.points) || dto.points === 0 || Math.abs(dto.points) > 100000) throw new BadRequestException('Puan tam sayı olmalı ve 0 olamaz');
    return this.db.transaction(async client => {
      const customer = await client.query('SELECT 1 FROM customers WHERE id=$1 FOR KEY SHARE', [customerId]);
      if (!customer.rowCount) throw new NotFoundException('Customer not found');
      await client.query('INSERT INTO customer_loyalty_accounts(customer_id) VALUES($1) ON CONFLICT(customer_id) DO NOTHING', [customerId]);
      const account = await client.query<{ points_balance: number }>('SELECT points_balance FROM customer_loyalty_accounts WHERE customer_id=$1 FOR UPDATE', [customerId]);
      const balance = Number(account.rows[0].points_balance) + dto.points;
      if (balance < 0) throw new ConflictException('Puan bakiyesi eksiye düşemez');
      const tier = balance >= 2000 ? 'GOLD' : balance >= 500 ? 'SILVER' : 'BRONZE';
      await client.query('UPDATE customer_loyalty_accounts SET points_balance=$1,tier=$2,updated_at=now() WHERE customer_id=$3', [balance, tier, customerId]);
      await client.query('INSERT INTO customer_loyalty_movements(customer_id,points_delta,reason,created_by) VALUES($1,$2,$3,$4)', [customerId, dto.points, reason, userId]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [userId, 'customer.loyalty.adjusted', 'customer', customerId, JSON.stringify({ points: dto.points, reason })]);
      return { pointsBalance: balance, tier };
    });
  }

  async requests(customerId: string) {
    return (await this.db.query(`SELECT id,subject,body,priority,status,resolution_note,created_at,updated_at,resolved_at
      FROM customer_requests WHERE customer_id=$1 ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'RESOLVED' THEN 2 ELSE 3 END,created_at DESC`, [customerId])).rows;
  }

  async createRequest(customerId: string, dto: CustomerRequestInput, userId: string) {
    const subject = dto.subject.trim(); const body = dto.body.trim();
    if (!subject || !body) throw new BadRequestException('Talep başlığı ve açıklaması zorunludur');
    return this.db.transaction(async client => {
      const customer = await client.query('SELECT 1 FROM customers WHERE id=$1 FOR KEY SHARE', [customerId]);
      if (!customer.rowCount) throw new NotFoundException('Customer not found');
      const result = await client.query<{ id: string }>(`INSERT INTO customer_requests(customer_id,subject,body,priority,created_by)
        VALUES($1,$2,$3,$4,$5) RETURNING id`, [customerId, subject, body, dto.priority, userId]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [userId, 'customer.request.created', 'customer_request', result.rows[0].id, JSON.stringify({ customerId, priority: dto.priority })]);
      return result.rows[0];
    });
  }

  async updateRequest(customerId: string, requestId: string, dto: RequestStatusInput, userId: string) {
    return this.db.transaction(async client => {
      const request = await client.query<{ id: string }>('SELECT id FROM customer_requests WHERE id=$1 AND customer_id=$2 FOR UPDATE', [requestId, customerId]);
      if (!request.rowCount) throw new NotFoundException('Customer request not found');
      const closing = dto.status === 'RESOLVED' || dto.status === 'CLOSED';
      await client.query(`UPDATE customer_requests SET status=$1,resolution_note=$2,updated_at=now(),resolved_at=CASE WHEN $3 THEN now() ELSE NULL END,resolved_by=CASE WHEN $3 THEN $4 ELSE NULL END WHERE id=$5`, [dto.status, dto.resolutionNote?.trim() || null, closing, userId, requestId]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [userId, 'customer.request.status.updated', 'customer_request', requestId, JSON.stringify({ status: dto.status })]);
      return { id: requestId, status: dto.status };
    });
  }
}
