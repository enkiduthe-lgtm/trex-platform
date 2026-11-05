import { AdminOrderService } from './admin-order.service';

describe('Dealer currency price floors',()=>{
  function service(rate:unknown){return new AdminOrderService({query:jest.fn(async(sql:string)=>{
    if(sql.includes('FROM dealers'))return {rowCount:1,rows:[{id:'d',dealer_level_id:'l'}]};
    if(sql.includes('FROM products'))return {rows:[{id:'p',amount:'100.00',currency:'TRY',packs:[{size:3,amount:'250.00'}]}]};
    if(sql.includes('admin_settings'))return {rows:[{settings:{manualEurTry:rate}}]};
    return {rows:[]};
  })} as never);}
  it('converts individual and pack floors upward to currency cents',async()=>{
    const result=await service(30).options('d',undefined,'EUR');
    expect(result.exchangeRate).toBe(30);
    expect(result.products[0]).toMatchObject({amount:'3.34',currency:'EUR',packs:[{size:3,amount:'8.34'}]});
  });
  it.each([undefined,0,-1,0.00000001])('blocks missing or invalid rates %s',async rate=>{
    await expect(service(rate).options('d',undefined,'EUR')).rejects.toThrow('Ortak Döviz Kuru');
  });
});
