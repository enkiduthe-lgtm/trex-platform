import {AdminController} from './admin.controller';
import { DealersService } from '../dealers/dealers.service';
import { DealerStatus } from '../dealers/dto/update-dealer-status.dto';
describe('Account archives',()=>{
 const owner={user:{id:'owner',role:'SUPER_ADMIN'}} as never;
 it('rejects a manager even when invoked outside the role guard',async()=>{
  const transaction=jest.fn();const controller=new AdminController({transaction} as never);
  await expect(controller.archiveAccount('staff','other',{isActive:false},{user:{id:'m',role:'ADMIN'}} as never)).rejects.toThrow('Yalnız Müdür');
  expect(transaction).not.toHaveBeenCalled();
 });
 it('cannot archive the current account',async()=>{
  await expect(new AdminController({} as never).archiveAccount('staff','owner',{isActive:false},owner)).rejects.toThrow('Silinemez');
 });
 it('archives staff and revokes sessions without deleting history',async()=>{
  const query=jest.fn().mockResolvedValue({rowCount:1,rows:[{archived_at:null}]});
  const controller=new AdminController({transaction:async(work:any)=>work({query})} as never);
  await controller.archiveAccount('staff','staff',{isActive:false},owner);
  expect(query.mock.calls[0][0]).toContain("role='ADMIN'");
  expect(query.mock.calls[2][0]).toContain('UPDATE sessions SET revoked_at');
  expect(query.mock.calls.every(call=>!call[0].includes('DELETE FROM'))).toBe(true);
 });
 it('returns without changing the date or audit log when already archived', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [{ archived_at: new Date() }] });
  const controller = new AdminController({ transaction: async (work: any) => work({ query }) } as never);
  await expect(controller.archiveAccount('staff', 'staff', { isActive: false }, owner)).resolves.toEqual({ id: 'staff' });
  expect(query).toHaveBeenCalledTimes(1);
 });
 it('restores an archived dealer without reactivating its portal login', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [{ archived_at: new Date() }] });
  const controller = new AdminController({ transaction: async (work: any) => work({ query }) } as never);
  await controller.archiveAccount('dealer', 'dealer', { isActive: true }, owner);
  expect(query.mock.calls[1]).toEqual([expect.stringContaining("status='SUSPENDED'"), ['dealer', true]]);
  expect(query.mock.calls[2][0]).toContain('is_active=false');
  expect(query.mock.calls[4][1]).toEqual(['owner', 'account.restored', 'dealer', 'dealer']);
 });
 it.each([DealerStatus.SUSPENDED, DealerStatus.REVIEWING, DealerStatus.REJECTED])('revokes sessions when a dealer is made %s', async status => {
  const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: 'dealer', status }] });
  const service = new DealersService({ query: jest.fn().mockResolvedValue({ rows: [] }), transaction: async (work: any) => work({ query }) } as never, {} as never);
  await service.updateStatus('dealer', status, { id: 'owner' } as never);
  expect(query.mock.calls[1]).toEqual([expect.stringContaining('UPDATE users SET is_active=$2'), ['dealer', false]]);
  expect(query.mock.calls[2]).toEqual([expect.stringContaining('UPDATE sessions SET revoked_at'), ['dealer']]);
 });
});
