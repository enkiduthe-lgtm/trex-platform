import { CampaignsService } from './campaigns.service';

describe('CampaignsService', () => {
  it('rejects a percentage above 100 without querying the database', async () => {
    const db = { query: jest.fn() }; const service = new CampaignsService(db as never);
    await expect(service.createCoupon('campaign', { code: 'TREX', discountType: 'PERCENT', discountValue: 101 },'user')).rejects.toThrow('100 değerini aşamaz');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('rejects an invalid campaign time window', async () => {
    const service = new CampaignsService({ query: jest.fn() } as never);
    await expect(service.create('X', 'user', '2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z')).rejects.toThrow('başlangıçtan sonra');
  });
  it.each(['invalid','2026-02-30T12:00','2026-01-01T24:00','2026-01-01T12:70'])('rejects impossible calendar time %s before database access',async value=>{
    const db={query:jest.fn(),transaction:jest.fn()};const service=new CampaignsService(db as never);await expect(service.create('Test','actor',value)).rejects.toThrow('Geçerli bir kampanya tarihi');expect(db.transaction).not.toHaveBeenCalled();
  });
  it('rejects blank names and invalid coupon values before opening a transaction',async()=>{
    const db={query:jest.fn(),transaction:jest.fn()},service=new CampaignsService(db as never);
    await expect(service.create('   ','actor')).rejects.toThrow('Kampanya adı');
    for(const discountValue of [0,-1,1.5,NaN,Infinity])await expect(service.createCoupon('id',{code:'TEST',discountType:'FIXED_TRY',discountValue},'actor')).rejects.toThrow('indirim değeri');
    await expect(service.createCoupon('id',{code:'bad code',discountType:'PERCENT',discountValue:5},'actor')).rejects.toThrow('Çek kodunda');
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('normalizes an unzoned business time to Istanbul and saves audit in the same transaction',async()=>{
    const query=jest.fn().mockResolvedValue({rows:[{id:'campaign'}],rowCount:1}),db={query:jest.fn(),transaction:jest.fn(work=>work({query}))},service=new CampaignsService(db as never);
    await expect(service.create(' Test ','actor','2026-11-22T10:00')).resolves.toMatchObject({id:'campaign'});
    expect(query.mock.calls[0][1]).toEqual(['Test','2026-11-22T07:00:00.000Z',null]);expect(query.mock.calls[1][0]).toContain('INSERT INTO audit_logs');expect(db.query).not.toHaveBeenCalled();
  });
  it('caps a fixed coupon discount at the cart subtotal', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'coupon', discount_type: 'FIXED_TRY', discount_value: '100.00', usage_limit: null, used_count: 0 }] }) };
    const service = new CampaignsService(db as never);
    await expect(service.previewCoupon('trex', 40)).resolves.toMatchObject({ discount: '40.00', total: '0.00', currency: 'TRY' });
  });
  it('rejects ambiguous legacy coupon codes rather than choosing a random discount',async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[{id:'first'},{id:'second'}]})};
    await expect(new CampaignsService(db as never).previewCoupon(' legacy ',100)).rejects.toThrow('birden fazla kayıt');
    expect(db.query.mock.calls[0][1]).toEqual(['legacy']);expect(db.query.mock.calls[0][0]).toContain('upper(trim(c.code))');
  });
});
