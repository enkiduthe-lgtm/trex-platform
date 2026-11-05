import {AdminController} from './admin.controller';
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
  const query=jest.fn().mockResolvedValue({rowCount:1,rows:[{id:'staff'}]});
  const controller=new AdminController({transaction:async(work:any)=>work({query})} as never);
  await controller.archiveAccount('staff','staff',{isActive:false},owner);
  expect(query.mock.calls[0][0]).toContain("role='ADMIN'");
  expect(query.mock.calls[1][0]).toContain('UPDATE sessions SET revoked_at');
  expect(query.mock.calls.every(call=>!call[0].includes('DELETE FROM'))).toBe(true);
 });
});
