import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AuditController } from './audit.controller';
import { ListAuditDto } from './dto/list-audit.dto';
import { RolesGuard } from './roles.guard';

describe('Read-only audit API', () => {
  it.each(['SUPER_ADMIN', 'ADMIN'])('permits %s', role => {
    const context = { getHandler: () => AuditController.prototype.list, getClass: () => AuditController, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) };
    expect(new RolesGuard(new Reflector()).canActivate(context as never)).toBe(true);
  });
  it.each(['WAREHOUSE', 'FINANCE', 'DEALER', 'CUSTOMER', undefined])('denies %s', role => {
    const context = { getHandler: () => AuditController.prototype.list, getClass: () => AuditController, switchToHttp: () => ({ getRequest: () => role ? { user: { role } } : {} }) };
    expect(() => new RolesGuard(new Reflector()).canActivate(context as never)).toThrow(ForbiddenException);
  });
  it.each(['0', '-1', '1.5', '2001', 'oops', ''])('rejects page %s', page => {
    expect(validateSync(plainToInstance(ListAuditDto, { page })).some(error => error.property === 'page')).toBe(true);
  });
  it('accepts default and string page numbers', () => {
    expect(validateSync(plainToInstance(ListAuditDto, {}))).toHaveLength(0);
    expect(plainToInstance(ListAuditDto, { page: '2' }).page).toBe(2);
    expect(validateSync(plainToInstance(ListAuditDto, { action: 'x'.repeat(121) }))).not.toHaveLength(0);
  });
  it('uses parameterized exact filters and bounded lookahead pagination', async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({ id: String(index) }));
    const query = jest.fn().mockResolvedValue({ rows });
    const filter = plainToInstance(ListAuditDto, { page: '2', action: "' OR true --", entityType: ' order ', entityId: ' key ' });
    const result = await new AuditController({ query } as never).list(filter);
    expect(result).toEqual({ page: 2, hasMore: true, items: rows.slice(0, 50) });
    expect(query.mock.calls[0][1]).toEqual(["' OR true --", 'order', 'key', 50]);
    expect(query.mock.calls[0][0]).toContain('ORDER BY a.created_at DESC,a.id DESC LIMIT 51 OFFSET $4');
    expect(query.mock.calls[0][0]).not.toContain('a.metadata');
    expect(query.mock.calls[0][0]).not.toContain('u.email');
    expect(query.mock.calls[0][0]).not.toContain("' OR true --");
  });
  it('handles empty results and stops at the page cap', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: Array(51).fill({ id: 'x' }) });
    const controller = new AuditController({ query } as never);
    await expect(controller.list(new ListAuditDto())).resolves.toEqual({ items: [], page: 1, hasMore: false });
    await expect(controller.list(plainToInstance(ListAuditDto, { page: 2000 }))).resolves.toMatchObject({ hasMore: false });
  });
});
