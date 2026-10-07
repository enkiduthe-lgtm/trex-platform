import { createHmac } from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { PaytrPaymentProvider } from './paytr-payment.provider';

describe('PayTR iFrame request',()=>{
  const originalEnv={...process.env}; const originalFetch=global.fetch;
  const basket=Buffer.from(JSON.stringify([['Çay','759.99',1]])).toString('base64');
  const input={amount:'759.99',currency:'TRY',reference:'cfb29322-1b9f-47d4-8d78-e5eb16fa6fb8',email:'test@example.com',name:'Test',phone:'555',address:'Test address',basket,userIp:'203.0.113.10'};
  beforeEach(()=>{process.env.PAYTR_MERCHANT_ID='123';process.env.PAYTR_MERCHANT_KEY='test-key';process.env.PAYTR_MERCHANT_SALT='test-salt';process.env.PAYTR_TEST_MODE='1';});
  afterEach(()=>{process.env={...originalEnv};global.fetch=originalFetch;});
  it('sends the encoded user basket and signs the exact iFrame field order',async()=>{
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({status:'success',token:'iframe-token'})});
    const result=await new PaytrPaymentProvider().initialize(input);
    const [url,options]=(global.fetch as jest.Mock).mock.calls[0];const body=options.body as URLSearchParams;
    expect(url).toBe('https://www.paytr.com/odeme/api/get-token');
    expect(body.get('user_basket')).toBe(basket);expect(body.has('merchant_basket')).toBe(false);
    expect(body.get('payment_amount')).toBe('75999');
    const reference=input.reference.replace(/-/g,'');
    expect(body.get('merchant_oid')).toBe(reference);
    const signature=createHmac('sha256','test-key').update(`123${input.userIp}${reference}${input.email}75999${basket}00TRY1test-salt`).digest('base64');
    expect(body.get('paytr_token')).toBe(signature);
    expect(result).toEqual({providerReference:reference,redirectUrl:'https://www.paytr.com/odeme/guvenli/iframe-token'});
  });
  it('keeps live mode in the signature and reports provider rejection',async()=>{
    process.env.PAYTR_TEST_MODE='0';
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({status:'failed',reason:'invalid basket'})});
    await expect(new PaytrPaymentProvider().initialize(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    const body=(global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams;
    expect(body.get('test_mode')).toBe('0');
    const reference=input.reference.replace(/-/g,'');
    expect(body.get('paytr_token')).toBe(createHmac('sha256','test-key').update(`123${input.userIp}${reference}${input.email}75999${basket}00TRY0test-salt`).digest('base64'));
  });
});
