import { CheckoutService } from './checkout.service';
import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
describe('CheckoutService', () => {
  const dto = { cartId: 'cfb29322-1b9f-47d4-8d78-e5eb16fa6fb8', guestKey: 'guest', warehouseId: '9f886414-bafe-4503-a1c6-8829bde37cfc', recipientName: 'Trex Test', contactEmail: 'test@trextea.com.tr', phone: '555', city: 'Istanbul', district: 'Kadikoy', addressLine: 'Test', reservationMinutes: 10 };
  const activeItem={product_id:'product',quantity:2,name:'Tea',sku:'TEA',status:'ACTIVE'};
  function checkoutSetup(items=[activeItem], warehouse=true) {
    const query=jest.fn(async(sql:string)=>{
      if(sql.startsWith('SELECT request_hash')) return {rows:[]};
      if(sql.startsWith('SELECT id FROM carts')) return {rows:[{id:dto.cartId}],rowCount:1};
      if(sql.startsWith('SELECT ci.product_id')) return {rows:items};
      if(sql.startsWith('SELECT id FROM warehouses')) return {rows:warehouse?[{id:dto.warehouseId}]:[]};
      if(sql.startsWith('SELECT physical_quantity')) return {rows:[{physical_quantity:10,reserved_quantity:0}]};
      if(sql.startsWith('INSERT INTO checkout_sessions')) return {rows:[{id:'checkout'}]};
      if(sql.startsWith('INSERT INTO stock_reservations')) return {rows:[{id:'reservation'}]};
      return {rows:[],rowCount:1};
    });
    const pricing={resolve:jest.fn().mockResolvedValue({amount:'759.99',currency:'TRY'})};
    const service=new CheckoutService({transaction:async(work:any)=>work({query})} as never,pricing as never);
    return {service,query,pricing};
  }
  it.each(['DRAFT','ARCHIVED'])('rejects %s items instead of silently omitting them',async status=>{
    const {service,query,pricing}=checkoutSetup([activeItem,{...activeItem,product_id:'inactive',status}]);
    await expect(service.create(dto,'key')).rejects.toThrow('satışa kapalı ürün');
    expect(pricing.resolve).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
  });
  it('rejects an inactive warehouse before reserving inventory',async()=>{
    const {service,query}=checkoutSetup([activeItem],false);
    await expect(service.create(dto,'key')).rejects.toThrow('aktif depo');
    expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
  });
  it('persists the exact unit-price snapshot and reservation movement in the same transaction',async()=>{
    const {service,query}=checkoutSetup();
    const result=await service.create(dto,'key');
    expect(result).toMatchObject({total:'1519.98',currency:'TRY'});
    const calls=query.mock.calls as unknown as [string,unknown[]][];
    expect(calls.find(([sql])=>sql.startsWith('SELECT ci.product_id'))![0]).toContain('ORDER BY ci.product_id FOR SHARE OF p');
    expect(calls.find(([sql])=>sql.startsWith('INSERT INTO checkout_items'))![1]).toEqual(['checkout','product','Tea','TEA',2,'759.99','TRY']);
    expect(calls.find(([sql])=>sql.startsWith('INSERT INTO inventory_movements'))![1]).toEqual(['product',dto.warehouseId,'reservation']);
  });
  it.each(['EUR','USD',null])('rejects unavailable or %s pricing before stock and payment writes', async currency => {
    const query = jest.fn().mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rowCount:1}).mockResolvedValueOnce({rows:[{product_id:'p',quantity:1,name:'Tea',sku:'tea',status:'ACTIVE'}]});
    const db = {transaction:async (work:(client:unknown)=>unknown)=>work({query})};
    const pricing = {resolve:jest.fn().mockResolvedValue(currency ? {amount:'20.00',currency} : null)};
    await expect(new CheckoutService(db as never,pricing as never).create(dto,'new-key')).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.every(call => call[0].startsWith('SELECT'))).toBe(true);
  });
  it('rejects a repeated idempotency key when its request changes', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ request_hash: 'different', resource_id: 'existing' }] }) };
    const db = { transaction: async (work: (client: unknown) => unknown) => work(client) };
    const service = new CheckoutService(db as never, {} as never);
    await expect(service.create(dto, 'repeat-key')).rejects.toBeInstanceOf(ConflictException);
  });
  it('replays the original checkout without a second stock reservation', async () => {
    const requestHash = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ request_hash: requestHash, resource_id: 'existing' }] }) };
    const db = { transaction: async (work: (client: unknown) => unknown) => work(client) };
    const service = new CheckoutService(db as never, {} as never);
    await expect(service.create(dto, 'repeat-key')).resolves.toEqual({ checkoutId: 'existing', replayed: true });
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
