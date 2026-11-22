import { AuthController } from './auth.controller';
describe('Sensitive authentication endpoint throttles',()=>{
  const request={ip:'203.0.113.10',get:()=> 'Synthetic browser',user:{id:'synthetic-user',email:'synthetic@example.invalid',role:'ADMIN',sessionId:'session'}};
  const cases=[
    ['requestPasswordReset','passwordResetRequest','requestPasswordReset',{email:'synthetic@example.invalid'}],
    ['confirmPasswordReset','passwordResetConfirm','confirmPasswordReset',{token:'synthetic-token',password:'synthetic-password'}],
    ['enrollMfa','mfaChange','enroll',null],
    ['confirmMfa','mfaChange','confirm',{code:'123456'}],
    ['disableMfa','mfaChange','disable',{code:'123456',password:'oldpass'}],
  ] as const;
  it.each(cases)('blocks %s before changing accounts or sending recovery notifications',async(method,throttleMethod,serviceMethod,dto)=>{
    const denied=new Error('rate limit'),throttle={[throttleMethod]:jest.fn().mockRejectedValue(denied)},auth={requestPasswordReset:jest.fn(),confirmPasswordReset:jest.fn()},mfa={enroll:jest.fn(),confirm:jest.fn(),disable:jest.fn()};
    const controller=new AuthController(auth as never,throttle as never,mfa as never),call=controller[method] as (...args:unknown[])=>Promise<unknown>;
    await expect(call.apply(controller,dto?[dto,request]:[request])).rejects.toBe(denied);
    expect([...Object.values(auth),...Object.values(mfa)].every(fn=>fn.mock.calls.length===0)).toBe(true);
    expect(throttle[throttleMethod]).toHaveBeenCalledTimes(1);
  });
  it('checks the authenticated account and operation before confirming MFA',async()=>{
    const events:string[]=[],throttle={mfaChange:jest.fn(async()=>{events.push('limit');})},mfa={confirm:jest.fn(async()=>{events.push('confirm');return {enabled:true};})};
    await new AuthController({} as never,throttle as never,mfa as never).confirmMfa({code:'123456'},request as never);
    expect(throttle.mfaChange).toHaveBeenCalledWith(request.ip,request.user.id,'confirm');expect(events).toEqual(['limit','confirm']);
  });
});
