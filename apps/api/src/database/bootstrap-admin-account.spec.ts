import { bootstrapAdminAccount } from './bootstrap-admin-account';
import * as argon2 from 'argon2';
describe('Bootstrap admin safety',()=>{
  function setup(role?:string, failAudit=false){
    const query=jest.fn(async(sql:string)=>{
      if(sql.startsWith('SELECT id,role'))return {rows:role?[{id:'user',role}]:[]};
      if(sql.startsWith('INSERT INTO users'))return {rows:[{id:'created'}]};
      if(failAudit&&sql.startsWith('INSERT INTO audit_logs'))throw new Error('audit failed');
      return {rows:[]};
    });
    return {query,client:{query}};
  }
  const password='random-test-password';
  it('creates a hashed account and its audit entry atomically',async()=>{
    const {client,query}=setup();
    await expect(bootstrapAdminAccount(client,' Admin@example.com ',password)).resolves.toEqual({id:'created',outcome:'created'});
    const calls=query.mock.calls as unknown as [string,unknown[]][];
    const values=calls.find(([sql])=>sql.startsWith('INSERT INTO users'))![1];
    expect(values[0]).toBe('admin@example.com');
    expect(await argon2.verify(values[1] as string,password)).toBe(true);
    expect(query.mock.calls.at(-1)![0]).toBe('COMMIT');
  });
  it('leaves an existing super admin unchanged by default',async()=>{
    const {client,query}=setup('SUPER_ADMIN');
    await expect(bootstrapAdminAccount(client,'admin@example.com',password)).resolves.toMatchObject({outcome:'unchanged'});
    expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT')||sql.startsWith('UPDATE'))).toBe(false);
  });
  it.each(['ADMIN','CUSTOMER','DEALER'])('never replaces a %s account',async role=>{
    const {client,query}=setup(role);
    await expect(bootstrapAdminAccount(client,'admin@example.com',password,true)).rejects.toThrow('non-super-admin');
    expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
    expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
  });
  it('revokes sessions in the password reset transaction',async()=>{
    const {client,query}=setup('SUPER_ADMIN');
    await expect(bootstrapAdminAccount(client,'admin@example.com',password,true)).resolves.toMatchObject({outcome:'reset'});
    expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE sessions SET revoked_at'))).toBe(true);
  });
  it('rolls back all account changes if the audit write fails',async()=>{
    const {client,query}=setup('SUPER_ADMIN',true);
    await expect(bootstrapAdminAccount(client,'admin@example.com',password,true)).rejects.toThrow('audit failed');
    expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
    expect(query.mock.calls.some(([sql])=>sql==='COMMIT')).toBe(false);
  });
});
