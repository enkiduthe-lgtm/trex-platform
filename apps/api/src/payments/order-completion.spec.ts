import { ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
describe('Payment to order snapshot and reservation safety',()=>{
  function setup(kind='valid') {
    const item={product_id:'product',product_name:'Original tea',sku:'ORIGINAL',quantity:2,unit_amount:'759.99',currency:kind==='currency'?'EUR':'TRY'};
    const query=jest.fn(async(sql:string)=>{
      if(sql.startsWith('SELECT total_amount'))return {rows:[{total_amount:'1519.98',currency:'TRY',cart_id:'cart',coupon_id:null,discount_amount:'0'}]};
      if(sql.startsWith('SELECT product_id,product_name'))return {rows:kind==='empty'?[]:[item]};
      if(sql.startsWith('SELECT product_id,warehouse_id'))return {rows:kind==='missing'?[]:[{product_id:'product',warehouse_id:'warehouse',quantity:kind==='quantity'?1:2},...(kind==='multiple'?[{product_id:'other',warehouse_id:'other',quantity:1}]:[])]};
      if(sql.startsWith('SELECT physical_quantity'))return {rows:kind==='no-inventory'?[]:[{physical_quantity:10,reserved_quantity:kind==='unreserved'?1:2}]};
      if(sql.startsWith('SELECT to_char'))return {rows:[{value:'TEST-1'}]};
      if(sql.startsWith('INSERT INTO orders '))return {rows:[{id:'order',order_number:'TEST-1'}]};
      if(sql.startsWith('SELECT recipient_name'))return {rows:[{recipient_name:'Original customer',phone:'555',city:'City',district:'District',address_line:'Original address',postal_code:null}]};
      return {rows:[],rowCount:1};
    });
    const service=new PaymentsService({} as never,{} as never);
    return {query,run:()=> (service as any).completeSuccessfulPayment({query},'payment','checkout',{createPick:false}),item};
  }
  it.each(['empty','currency','missing','quantity','multiple','no-inventory','unreserved'])('rejects %s before creating the order or marking payment successful',async kind=>{
    const {query,run}=setup(kind);
    await expect(run()).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT')||sql.startsWith('UPDATE'))).toBe(false);
  });
  it('copies immutable checkout names/prices/address without querying current product pricing',async()=>{
    const {query,run}=setup();
    await expect(run()).resolves.toMatchObject({orderId:'order',status:'SUCCEEDED'});
    const calls=query.mock.calls as unknown as [string,unknown[]][];
    expect(calls.find(([sql])=>sql.startsWith('INSERT INTO order_items'))![1]).toEqual(['order','product','Original tea','ORIGINAL',2,'759.99','TRY']);
    expect(calls.find(([sql])=>sql.startsWith('INSERT INTO order_addresses'))![1]).toEqual(['order','Original customer','555','City','District','Original address',null]);
    expect(calls.some(([sql])=>sql.includes('product_prices'))).toBe(false);
    expect(calls.find(([sql])=>sql.startsWith('SELECT product_id,warehouse_id'))![0]).toContain("status='ACTIVE'");
  });
});
