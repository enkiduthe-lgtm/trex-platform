import { createHmac } from 'crypto';
import { PaymentsService } from './payments.service';
describe('PayTR terminal payment safeguards',()=>{
  const previousKey=process.env.PAYTR_MERCHANT_KEY;
  const previousSalt=process.env.PAYTR_MERCHANT_SALT;
  beforeAll(()=>{process.env.PAYTR_MERCHANT_KEY='test-key';process.env.PAYTR_MERCHANT_SALT='test-salt';});
  afterAll(()=>{
    if(previousKey===undefined)delete process.env.PAYTR_MERCHANT_KEY;else process.env.PAYTR_MERCHANT_KEY=previousKey;
    if(previousSalt===undefined)delete process.env.PAYTR_MERCHANT_SALT;else process.env.PAYTR_MERCHANT_SALT=previousSalt;
  });
  function setup(paymentStatus:string){
    const query=jest.fn().mockResolvedValue({rows:[],rowCount:1});
    query.mockResolvedValueOnce({rows:[],rowCount:1}).mockResolvedValueOnce({rows:[{id:'payment',status:paymentStatus}],rowCount:1});
    const service=new PaymentsService({transaction:async(work:any)=>work({query})} as never,{} as never);
    const complete=jest.spyOn(service as any,'completeSuccessfulPayment').mockResolvedValue({status:'SUCCEEDED'});
    return {service,query,complete};
  }
  function payload(status:'success'|'failed'){
    return {merchant_oid:'reference',status,total_amount:'1000',hash:createHmac('sha256','test-key').update(`referencetest-salt${status}1000`).digest('base64')};
  }
  it.each(['SUCCEEDED','FAILED','REFUNDED'])('does not overwrite %s on a later success',async status=>{
    const {service,query,complete}=setup(status);
    await expect(service.receivePaytrCallback(payload('success'))).resolves.toMatchObject({response:'OK',replayed:true});
    expect(complete).not.toHaveBeenCalled();expect(query).toHaveBeenCalledTimes(2);
  });
  it.each(['SUCCEEDED','FAILED','REFUNDED'])('does not overwrite %s on a later failure',async status=>{
    const {service,query,complete}=setup(status);
    await expect(service.receivePaytrCallback(payload('failed'))).resolves.toMatchObject({response:'OK',replayed:true});
    expect(complete).not.toHaveBeenCalled();expect(query).toHaveBeenCalledTimes(2);
  });
  it('marks pending payment and attempt failed with an audit entry, without creating an order',async()=>{
    const {service,query,complete}=setup('PENDING');
    await expect(service.receivePaytrCallback(payload('failed'))).resolves.toMatchObject({response:'OK',matched:true});
    expect(complete).not.toHaveBeenCalled();
    expect(query.mock.calls[2][0]).toContain("UPDATE payments SET status='FAILED'");
    expect(query.mock.calls[3][0]).toContain("UPDATE payment_attempts SET status='FAILED'");
    expect(query.mock.calls[4][1]).toEqual(['payment.failed','payment','payment']);
  });
  it('does not acknowledge when the atomic failure write fails',async()=>{
    const {service,query}=setup('PENDING');
    query.mockReset().mockResolvedValueOnce({rowCount:1}).mockResolvedValueOnce({rows:[{id:'payment',status:'PENDING'}],rowCount:1}).mockRejectedValueOnce(new Error('write failed'));
    await expect(service.receivePaytrCallback(payload('failed'))).rejects.toThrow('write failed');
  });
});
