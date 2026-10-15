import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { AddSupportMessageDto, UpdateSupportTicketDto } from './dto/update-support-ticket.dto';

type Ticket = { id: string; ticket_number: string; status: string; priority: string; contact_name: string; contact_email: string | null; contact_phone: string | null; subject: string; order_number: string | null; assigned_email: string | null; created_at: string; updated_at: string; due_at: string; };

@Injectable()
export class SupportService {
  constructor(private readonly db: DatabaseService) {}
  async list(status?: string) {
    return (await this.db.query<Ticket>(`SELECT t.id,t.ticket_number,t.status,t.priority,t.contact_name,t.contact_email,t.contact_phone,t.subject,t.created_at,t.updated_at,t.due_at,o.order_number,u.email AS assigned_email FROM support_tickets t LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN users u ON u.id=t.assigned_to WHERE ($1::text IS NULL OR t.status=$1) ORDER BY CASE WHEN t.status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER') AND t.due_at<now() THEN 0 ELSE 1 END,CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,t.due_at ASC`, [status ?? null])).rows;
  }
  async summary() {
    const result = await this.db.query<{ open_count: string; urgent_count: string; overdue_count: string }>(`SELECT
      count(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER'))::text AS open_count,
      count(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER') AND priority IN ('HIGH','URGENT'))::text AS urgent_count,
      count(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER') AND due_at < now())::text AS overdue_count
      FROM support_tickets`);
    return result.rows[0] ?? { open_count: '0', urgent_count: '0', overdue_count: '0' };
  }
  async assignees() {
    return (await this.db.query<{ id: string; email: string; role: string }>("SELECT id,email,role FROM users WHERE is_active=true AND role IN ('SUPER_ADMIN','ADMIN','WAREHOUSE','FINANCE') ORDER BY email")).rows;
  }
  async detail(id: string) {
    const ticket = await this.db.query<Ticket & { assigned_to: string | null; customer_id: string | null; order_id: string | null; resolved_at: string | null }>(`SELECT t.*,o.order_number,u.email AS assigned_email FROM support_tickets t LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN users u ON u.id=t.assigned_to WHERE t.id=$1`, [id]);
    if (!ticket.rowCount) throw new NotFoundException('Destek talebi bulunamadı');
    const messages = await this.db.query<{ id: string; body: string; is_internal: boolean; created_at: string; created_by_email: string | null }>('SELECT m.id,m.body,m.is_internal,m.created_at,u.email AS created_by_email FROM support_ticket_messages m LEFT JOIN users u ON u.id=m.created_by WHERE m.ticket_id=$1 ORDER BY m.created_at', [id]);
    const activity = await this.db.query<{ id: string; action: string; created_at: string; actor_email: string | null }>('SELECT a.id,a.action,a.created_at,u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.entity_type=$1 AND a.entity_id=$2 ORDER BY a.created_at DESC LIMIT 100', ['support_ticket', id]);
    return { ...ticket.rows[0], messages: messages.rows, activity: activity.rows };
  }
  async create(dto: CreateSupportTicketDto, actorId: string) {
    return this.db.transaction(async client => {
      const sequence = await client.query<{ value: number }>("SELECT nextval('support_ticket_number_seq')::int AS value");
      const year = new Date().getFullYear(); const ticketNumber = `DST-${year}-${String(sequence.rows[0].value).padStart(6, '0')}`;
      const priority=dto.priority ?? 'NORMAL';
      const ticket = await client.query<{ id: string; ticket_number: string; due_at: string }>(`INSERT INTO support_tickets(ticket_number,customer_id,order_id,contact_name,contact_email,contact_phone,subject,priority,due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+CASE $8 WHEN 'URGENT' THEN interval '2 hours' WHEN 'HIGH' THEN interval '8 hours' WHEN 'NORMAL' THEN interval '24 hours' ELSE interval '72 hours' END) RETURNING id,ticket_number,due_at`, [ticketNumber, dto.customerId ?? null, dto.orderId ?? null, dto.contactName.trim(), dto.contactEmail?.toLowerCase() ?? null, dto.contactPhone?.trim() ?? null, dto.subject.trim(), priority]);
      await client.query('INSERT INTO support_ticket_messages(ticket_id,body,is_internal,created_by) VALUES($1,$2,false,$3)', [ticket.rows[0].id, dto.message.trim(), actorId]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [actorId, 'support_ticket.created', 'support_ticket', ticket.rows[0].id, JSON.stringify({ ticketNumber,priority,dueAt:ticket.rows[0].due_at })]);
      return ticket.rows[0];
    });
  }
  async update(id: string, dto: UpdateSupportTicketDto, actorId: string) {
    const hasAssigneeChange=Object.prototype.hasOwnProperty.call(dto,'assignedTo');
    const result = await this.db.query<{ id: string; status: string; priority: string; assigned_to: string | null }>(`UPDATE support_tickets SET status=COALESCE($2,status),priority=COALESCE($3,priority),assigned_to=CASE WHEN $5::boolean THEN $4::uuid ELSE assigned_to END,resolved_at=CASE WHEN COALESCE($2,status) IN ('RESOLVED','CLOSED') THEN COALESCE(resolved_at,now()) ELSE NULL END,updated_at=now() WHERE id=$1 RETURNING id,status,priority,assigned_to`, [id, dto.status ?? null, dto.priority ?? null, dto.assignedTo ?? null, hasAssigneeChange]);
    if (!result.rowCount) throw new NotFoundException('Destek talebi bulunamadı');
    await this.db.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [actorId, 'support_ticket.updated', 'support_ticket', id, JSON.stringify(dto)]);
    return result.rows[0];
  }
  async addMessage(id: string, dto: AddSupportMessageDto, actorId: string) {
    const exists = await this.db.query('SELECT 1 FROM support_tickets WHERE id=$1', [id]);
    if (!exists.rowCount) throw new NotFoundException('Destek talebi bulunamadı');
    return this.db.transaction(async client => {
      const message = await client.query<{ id: string }>('INSERT INTO support_ticket_messages(ticket_id,body,is_internal,created_by) VALUES($1,$2,$3,$4) RETURNING id', [id, dto.body.trim(), Boolean(dto.isInternal), actorId]);
      await client.query(`UPDATE support_tickets SET status=CASE WHEN status IN ('RESOLVED','CLOSED') THEN 'IN_PROGRESS' ELSE status END,updated_at=now() WHERE id=$1`, [id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [actorId, 'support_ticket.message_added', 'support_ticket', id, JSON.stringify({ internal: Boolean(dto.isInternal) })]);
      return message.rows[0];
    });
  }
}
