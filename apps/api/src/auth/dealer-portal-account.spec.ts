import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import * as argon2 from 'argon2';
import { AdminController } from './admin.controller';
import { CreateDealerPortalAccountDto } from './dto/create-dealer-portal-account.dto';
import { RolesGuard } from './roles.guard';
jest.mock('argon2',()=>({hash:jest.fn().mockResolvedValue('synthetic-hash'),argon2id:2}));

describe('Director-only dealer credentials',()=>{
 const dto={email:' Test@Example.test ',password:'example-password-123'},owner={user:{id:'owner',role:'SUPER_ADMIN'}} as never;
 beforeEach(()=>jest.clearAllMocks());
 function setup(){
  const query=jest.fn().mockResolvedValueOnce({rowCount:1,rows:[{id:'dealer'}]}).mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{id:'new-user'}]}).mockResolvedValue({rowCount:1,rows:[]});
  const db={transaction:jest.fn(work=>work({query}))};return {query,db,controller:new AdminController(db as never)};
 }
 it.each(['ADMIN','WAREHOUSE','FINANCE','DEALER','CUSTOMER'])('rejects %s before hashing or database access',async role=>{
  const s=setup();await expect(s.controller.createDealerPortalAccount('dealer',dto,{user:{id:'other',role}} as never)).rejects.toThrow('yalnız Müdür');expect(argon2.hash).not.toHaveBeenCalled();expect(s.db.transaction).not.toHaveBeenCalled();
 });
 it('does not let dealer record creation grants create login credentials',async()=>{
  const context={getHandler:()=>undefined,getClass:()=>undefined,switchToHttp:()=>({getRequest:()=>({user:{id:'staff',role:'ADMIN'},method:'POST',path:'/V1/ADMIN/DEALERS/example/PORTAL-ACCOUNT/'})})} as never;
  const guard=new RolesGuard({getAllAndOverride:()=>['SUPER_ADMIN']} as never,{query:async()=>({rowCount:1,rows:[{grants:['DEALERS.VIEW','DEALERS.CREATE','DEALERS.APPROVE']}]})} as never);
  await expect(guard.canActivate(context)).rejects.toThrow('Yetki Verilmemiş');
 });
 it('normalizes and validates the typed email without changing the password',()=>{
  const value=plainToInstance(CreateDealerPortalAccountDto,dto);expect(value.email).toBe('test@example.test');expect(value.password).toBe(dto.password);expect(validateSync(value)).toHaveLength(0);
  for(const payload of [{email:123,password:dto.password},{email:dto.email,password:123},{email:dto.email,password:'short'}])expect(validateSync(plainToInstance(CreateDealerPortalAccountDto,payload)).length).toBeGreaterThan(0);
 });
 it('rejects malformed direct inputs without a hash or transaction',async()=>{
  const s=setup();for(const payload of [{email:123,password:dto.password},{email:dto.email,password:123},undefined])await expect(s.controller.createDealerPortalAccount('dealer',payload as never,owner)).rejects.toThrow('Geçerli e-posta');expect(argon2.hash).not.toHaveBeenCalled();expect(s.db.transaction).not.toHaveBeenCalled();
 });
 it('creates only a dealer-role login for a verified active unarchived dealer',async()=>{
  const s=setup();await expect(s.controller.createDealerPortalAccount('dealer',dto,owner)).resolves.toEqual({id:'new-user',email:'test@example.test'});expect(argon2.hash).toHaveBeenCalledWith(dto.password,{type:2});expect(s.query.mock.calls[0][0]).toContain("status='ACTIVE' AND archived_at IS NULL FOR UPDATE");expect(s.query.mock.calls[2][0]).toContain("'DEALER'");expect(s.query.mock.calls[2][1]).toEqual(['test@example.test','synthetic-hash']);expect(s.query.mock.calls[4][0]).toContain('audit_logs');
 });
 it('does not create a login for an inactive, archived or already linked dealer',async()=>{
  const missing=setup();missing.query.mockReset().mockResolvedValue({rows:[],rowCount:0});await expect(missing.controller.createDealerPortalAccount('dealer',dto,owner)).rejects.toThrow('aktif bayi onayı');expect(missing.query).toHaveBeenCalledTimes(1);
  const existing=setup();existing.query.mockReset().mockResolvedValue({rows:[{id:'existing'}],rowCount:1});await expect(existing.controller.createDealerPortalAccount('dealer',dto,owner)).rejects.toThrow('zaten açılmış');expect(existing.query).toHaveBeenCalledTimes(2);
 });
});
