import { validate } from 'class-validator';
import { DisableMfaDto } from './dto/mfa.dto';

describe('Current MFA password validation',()=>{
  it('accepts an existing short password without imposing new-password policy',async()=>{
    const dto=Object.assign(new DisableMfaDto(),{password:'oldpass',code:'123456'});
    expect(await validate(dto)).toHaveLength(0);
  });
  it.each(['',undefined,'x'.repeat(129)])('rejects missing or oversized current passwords',async password=>{
    const dto=Object.assign(new DisableMfaDto(),{password,code:'123456'});
    expect((await validate(dto)).some(error=>error.property==='password')).toBe(true);
  });
  it.each(['12345','abcdef','1234567'])('still requires an exact six-digit code',async code=>{
    const dto=Object.assign(new DisableMfaDto(),{password:'oldpass',code});
    expect((await validate(dto)).some(error=>error.property==='code')).toBe(true);
  });
});
