import { NotFoundException } from '@nestjs/common';
import { SupportService } from './support.service';

describe('SupportService', () => {
  function setup() {
    const client = { query: jest.fn() };
    const db = { query: jest.fn(), transaction: jest.fn(async (work: (client: typeof client) => unknown) => work(client)) };
    return { db, client, service: new SupportService(db as never) };
  }

  it('creates a numbered ticket, first public message, and audit record together', async () => {
    const s = setup();
    s.client.query.mockResolvedValueOnce({ rows: [{ value: 42 }] }).mockResolvedValueOnce({ rows: [{ id: 'ticket-1', ticket_number: 'DST-2026-000042', due_at: '2026-10-15T12:00:00Z' }] }).mockResolvedValue({ rowCount: 1, rows: [] });
    await expect(s.service.create({ contactName: 'Ada', subject: 'Teslimat', message: 'Kargom nerede?' }, 'staff-1')).resolves.toEqual(expect.objectContaining({ id: 'ticket-1', ticket_number: 'DST-2026-000042' }));
    expect(s.client.query.mock.calls[1][1]).toEqual(expect.arrayContaining(['DST-2026-000042', 'Ada', 'Teslimat', 'NORMAL']));
    expect(s.client.query.mock.calls[2][1]).toEqual(['ticket-1', 'Kargom nerede?', false, 'staff-1']);
    expect(s.client.query.mock.calls[3][1]).toEqual(['staff-1', 'support_ticket.created', 'support_ticket', 'ticket-1', JSON.stringify({ ticketNumber: 'DST-2026-000042', priority: 'NORMAL', dueAt: '2026-10-15T12:00:00Z' })]);
  });

  it('does not add a message to a missing ticket', async () => {
    const s = setup(); s.db.query.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(s.service.addMessage('missing', { body: 'Not' }, 'staff-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(s.db.transaction).not.toHaveBeenCalled();
  });

  it('returns queue totals for open, priority, and overdue support work', async () => {
    const s = setup(); s.db.query.mockResolvedValue({ rows: [{ open_count: '4', urgent_count: '1', overdue_count: '2' }] });
    await expect(s.service.summary()).resolves.toEqual({ open_count: '4', urgent_count: '1', overdue_count: '2' });
    expect(s.db.query.mock.calls[0][0]).toContain('due_at < now()');
  });
  it('lists only active staff for assignment', async () => {
    const s = setup(); s.db.query.mockResolvedValue({ rows: [{ id: 'staff-1', email: 'staff@trextea.com.tr', role: 'ADMIN' }] });
    await expect(s.service.assignees()).resolves.toEqual([{ id: 'staff-1', email: 'staff@trextea.com.tr', role: 'ADMIN' }]);
    expect(s.db.query.mock.calls[0][0]).toContain('is_active=true');
  });
  it('loads ticket messages and audit activity together for one case view', async () => {
    const s = setup();
    s.db.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'ticket-1' }] }).mockResolvedValueOnce({ rows: [{ id: 'message-1' }] }).mockResolvedValueOnce({ rows: [{ id: 'activity-1', action: 'support_ticket.created' }] });
    await expect(s.service.detail('ticket-1')).resolves.toEqual(expect.objectContaining({ messages: [{ id: 'message-1' }], activity: [{ id: 'activity-1', action: 'support_ticket.created' }] }));
    expect(s.db.query.mock.calls[2][1]).toEqual(['support_ticket', 'ticket-1']);
  });
});
