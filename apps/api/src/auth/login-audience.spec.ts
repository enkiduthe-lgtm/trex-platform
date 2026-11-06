import { validate } from 'class-validator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
jest.mock('argon2',()=>({verify:jest.fn().mockResolvedValue(true)}));
describe('Login audience isolation',()=>{
 it('requires a panel selection and rejects arbitrary panel values',async()=>{for(const audience of [undefined,'OTHER']){const dto=Object.assign(new LoginDto(),{email:'test@example.com',password:'oldpass',audience});expect((await validate(dto)).some(e=>e.property==='audience')).toBe(true);}});
 function setup(role:string){const db={query:jest.fn().mockResolvedValueOnce({rows:[{id:'u',email:'test@example.com',role,is_active:true,password_hash:'hash'}]}).mockResolvedValue({rows:[{id:'session'}]})};const jwt={signAsync:jest.fn().mockResolvedValue('token')};const mfa={verifyLogin:jest.fn()};return {db,jwt,mfa,service:new AuthService(db as never,jwt as never,mfa as never)};}
 it.each(['ADMIN','DEALER'])('rejects %s at director login before session creation',async role=>{const s=setup(role);await expect(s.service.login('test@example.com','oldpass',{},undefined,'MASTER')).rejects.toThrow('Giriş Bölümünü');expect(s.db.query).toHaveBeenCalledTimes(1);expect(s.jwt.signAsync).not.toHaveBeenCalled();});
 it('rejects director credentials at dealer login',async()=>{const s=setup('SUPER_ADMIN');await expect(s.service.login('test@example.com','oldpass',{},undefined,'DEALER')).rejects.toThrow();expect(s.db.query).toHaveBeenCalledTimes(1);});
 it.each([['DEALER','ADMIN'],['ADMIN','DEALER'],['SUPER_ADMIN','ADMIN']] as const)('rejects %s at the %s entrance without issuing a session',async(role,audience)=>{const s=setup(role);await expect(s.service.login('test@example.com','oldpass',{},undefined,audience)).rejects.toThrow('Giriş Bölümünü');expect(s.db.query).toHaveBeenCalledTimes(1);expect(s.jwt.signAsync).not.toHaveBeenCalled();});
 it.each([['SUPER_ADMIN','MASTER'],['ADMIN','ADMIN'],['DEALER','DEALER']] as const)('accepts matching %s role',async(role,audience)=>{const s=setup(role);await expect(s.service.login('test@example.com','oldpass',{},undefined,audience)).resolves.toHaveProperty('accessToken','token');expect(s.mfa.verifyLogin).toHaveBeenCalled();});
 it('accepts existing shorter passwords at login without changing their hashes',async()=>{const dto=Object.assign(new LoginDto(),{email:'test@example.com',password:'oldpass',audience:'ADMIN'});expect(await validate(dto)).toHaveLength(0);});
});
