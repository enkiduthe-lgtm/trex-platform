import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ConflictException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { REQUIRED_ROLES } from './roles.decorator';
import { Roles } from './roles';

const request = { user: { id: 'owner' } } as never;
describe('Staff security', () => {
  it.each(['ADMIN', 'WAREHOUSE', 'FINANCE'])('accepts staff role %s', role => {
    expect(validateSync(plainToInstance(CreateStaffUserDto, { email: 'staff@example.com', password: 'long-password-123', role }))).toHaveLength(0);
  });
  it.each(['SUPER_ADMIN', 'DEALER', 'CUSTOMER', 'UNKNOWN', null])('rejects role %s', role => {
    expect(validateSync(plainToInstance(CreateStaffUserDto, { email: 'staff@example.com', password: 'long-password-123', role })).some(error => error.property === 'role')).toBe(true);
  });
  it.each(['staff', 'createStaff', 'updateStaff'] as const)('limits %s to the owner role', method => {
    expect(Reflect.getMetadata(REQUIRED_ROLES, AdminController.prototype[method])).toEqual([Roles.SUPER_ADMIN]);
  });
  function setup(query: jest.Mock) {
    const transaction = jest.fn(async work => work({ query }));
    const db = { query: jest.fn(), transaction };
    return { controller: new AdminController(db as never), db, transaction };
  }
  it('deactivation revokes old sessions and audits in one transaction', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'staff' }] }).mockResolvedValue({ rows: [] });
    const s = setup(query);
    await expect(s.controller.updateStaff('staff', { isActive: false }, request)).resolves.toEqual({ id: 'staff' });
    expect(s.transaction).toHaveBeenCalledTimes(1);
    expect(s.db.query).not.toHaveBeenCalled();
    expect(query.mock.calls[1]).toEqual(['UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', ['staff']]);
    expect(query.mock.calls[2][1]).toEqual(['owner', 'staff.deactivated', 'user', 'staff']);
  });
  it('activation does not restore revoked sessions', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'staff' }] }).mockResolvedValue({ rows: [] });
    await setup(query).controller.updateStaff('staff', { isActive: true }, request);
    expect(query.mock.calls).toHaveLength(2);
    expect(query.mock.calls[1][1]).toEqual(['owner', 'staff.activated', 'user', 'staff']);
  });
  it('missing or protected account stops before session or audit changes', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(setup(query).controller.updateStaff('owner', { isActive: false }, request)).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("role IN ('ADMIN','WAREHOUSE','FINANCE')");
  });
  it('audit failure fails the transaction instead of reporting success', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'staff' }] }).mockRejectedValueOnce(new Error('audit failed'));
    await expect(setup(query).controller.updateStaff('staff', { isActive: true }, request)).rejects.toThrow('audit failed');
  });
});
