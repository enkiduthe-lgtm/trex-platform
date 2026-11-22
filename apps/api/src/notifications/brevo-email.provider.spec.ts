import { BrevoEmailProvider } from './brevo-email.provider';
import { NotificationDeliveryError } from './notification-delivery-error';

describe('Brevo acknowledgements',()=>{
  const originalFetch=global.fetch,keys=['BREVO_API_KEY','BREVO_FROM_EMAIL'] as const;
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const input={recipient:'recipient@example.test',subject:'Test',body:'Test mesajı',idempotencyKey:'00000000-0000-4000-8000-000000000001'};
  beforeEach(()=>{process.env.BREVO_API_KEY='test-private-key';process.env.BREVO_FROM_EMAIL='sender@example.test';});
  afterEach(()=>{global.fetch=originalFetch;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}});
  it('uses the persisted attempt key and requires a provider message ID',async()=>{
    const fetch=jest.fn().mockResolvedValue({ok:true,status:201,json:async()=>({messageId:'provider-reference'})});global.fetch=fetch;
    await expect(new BrevoEmailProvider().send(input)).resolves.toEqual({providerReference:'provider-reference'});
    const [url,options]=fetch.mock.calls[0];expect(url).toBe('https://api.brevo.com/v3/smtp/email');expect(options.redirect).toBe('error');expect(options.signal).toBeDefined();expect(JSON.parse(options.body).headers.idempotencyKey).toBe(input.idempotencyKey);
  });
  it.each([{status:400,body:{code:'invalid_parameter',message:'private-provider-content'},uncertain:false},{status:401,body:null,uncertain:false},{status:400,body:{code:'duplicate_parameter'},uncertain:true},{status:503,body:{},uncertain:true}])('classifies HTTP $status without leaking response content',async sample=>{
    global.fetch=jest.fn().mockResolvedValue({ok:false,status:sample.status,json:async()=>{if(sample.body===null)throw Error('parse');return sample.body;}});
    try{await new BrevoEmailProvider().send(input);throw Error('Expected rejection');}catch(error){expect(error).toBeInstanceOf(NotificationDeliveryError);expect((error as NotificationDeliveryError).uncertain).toBe(sample.uncertain);expect(String(error)).not.toContain('private-provider-content');expect(String(error)).not.toContain('test-private-key');}
  });
  it.each([null,{}, {messageId:''}, {messageId:123}])('does not claim acceptance for a missing acknowledgement',async body=>{
    global.fetch=jest.fn().mockResolvedValue({ok:true,status:201,json:async()=>body});await expect(new BrevoEmailProvider().send(input)).rejects.toMatchObject({uncertain:true});
  });
  it('treats a lost response as unknown and masks the original error',async()=>{
    global.fetch=jest.fn().mockRejectedValue(Error('https://private-key@example.test'));await expect(new BrevoEmailProvider().send(input)).rejects.toMatchObject({uncertain:true});
    await expect(new BrevoEmailProvider().send(input)).rejects.not.toThrow('private-key');
  });
  it('rejects missing connection settings before fetching',async()=>{
    delete process.env.BREVO_API_KEY;const fetch=jest.fn();global.fetch=fetch;await expect(new BrevoEmailProvider().send(input)).rejects.toMatchObject({uncertain:false});expect(fetch).not.toHaveBeenCalled();
  });
});
