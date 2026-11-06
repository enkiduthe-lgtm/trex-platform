import { ShippingService } from './shipping.service';
describe('ShippingService', () => {
  it('returns an existing created shipment without calling the provider again', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'shipment', status: 'CREATED', tracking_number: 'TRX1' }] }) };
    const provider = { createShipment: jest.fn() };
    const service = new ShippingService(db as never, provider as never, provider as never);
    await expect(service.create('order')).resolves.toEqual({ shipmentId: 'shipment', trackingNumber: 'TRX1', replayed: true });
    expect(provider.createShipment).not.toHaveBeenCalled();
  });

  it('verifies an existing Aras record before replay and never returns placeholder tracking',async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[{id:'shipment',status:'CREATED',provider:'aras',provider_reference:'REF',package_barcode:'PKG',order_number:'ORDER',tracking_number:'ORDER'}]})};
    const aras={verifyRegisteredShipment:jest.fn().mockResolvedValue(true),createShipment:jest.fn()};
    await expect(new ShippingService(db as never,{} as never,aras as never).create('order')).resolves.toMatchObject({replayed:true,trackingNumber:null});
    expect(aras.verifyRegisteredShipment).toHaveBeenCalledWith('REF','PKG');expect(aras.createShipment).not.toHaveBeenCalled();
  });

  it('lists only packed orders without an existing shipment in the shipment queue', async () => {
    const db={query:jest.fn().mockResolvedValue({rows:[{order_id:'order',order_number:'2026-0001'}]})};
    const service=new ShippingService(db as never,{} as never,{} as never);
    await expect(service.readyToShip()).resolves.toEqual([{order_id:'order',order_number:'2026-0001'}]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("o.status='PROCESSING'"));
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('pk.package_barcode'));
  });
  it('records a manual status transition as an event and audit entry',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rows:[{id:'shipment',status:'CREATED',order_status:'PROCESSING',contact_email:'buyer@example.com',order_number:'2026-1'}]}).mockResolvedValue({rows:[]});
    const notifications={recordOrderStatus:jest.fn()};
    const service=new ShippingService({transaction:async(work:(client:unknown)=>unknown)=>work({query})} as never,{} as never,{} as never,notifications as never);
    await expect(service.updateStatus('order',{status:'IN_TRANSIT'} as never,'actor')).resolves.toEqual({id:'shipment',status:'IN_TRANSIT'});
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'),['order']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('shipment_events'),expect.any(Array));
    expect(notifications.recordOrderStatus).toHaveBeenCalledWith('buyer@example.com','2026-1','SHIPPED');
  });
  it('allows a newly created shipment to be cancelled before dispatch',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rows:[{id:'shipment',status:'CREATED',contact_email:null,order_number:'2026-1'}]}).mockResolvedValue({rows:[]});
    const service=new ShippingService({transaction:async(work:(client:unknown)=>unknown)=>work({query})} as never,{} as never,{} as never);
    await expect(service.updateStatus('order',{status:'CANCELLED',description:'Adres değişti'} as never,'actor')).resolves.toEqual({id:'shipment',status:'CANCELLED'});
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE shipments SET status=$1'),['CANCELLED','Adres değişti','shipment']);
  });
  it('records a customer notification when delivery fails',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rows:[{id:'shipment',status:'IN_TRANSIT',contact_email:'buyer@example.com',order_number:'2026-2'}]}).mockResolvedValue({rows:[]});
    const notifications={recordOrderStatus:jest.fn()};
    const service=new ShippingService({transaction:async(work:(client:unknown)=>unknown)=>work({query})} as never,{} as never,{} as never,notifications as never);
    await service.updateStatus('order',{status:'FAILED'} as never,'actor');
    expect(notifications.recordOrderStatus).toHaveBeenCalledWith('buyer@example.com','2026-2','DELIVERY_EXCEPTION');
  });
});

describe('Verified Aras transitions',()=>{
 const observation={reference:'REF',eventId:'aras:unique',code:'6',direction:'1',trackingNumber:'123'};
 function setup(status='CREATED',order_status='PROCESSING',provider_reference='REF') {
  const query=jest.fn().mockResolvedValueOnce({rows:[{id:'shipment',status,order_status,provider:'aras',provider_reference,contact_email:null,order_number:'ORDER'}]}).mockResolvedValue({rows:[]});
  const commissions={awardForDeliveredOrder:jest.fn(),confirmForOrderItem:jest.fn()};
  const service=new ShippingService({transaction:async(work:any)=>work({query})} as never,{} as never,{} as never,undefined,commissions as never);
  return {query,service,commissions};
 }
 it('allows a missed transit scan to be followed by verified delivery and commission finalization',async()=>{
  const s=setup();await s.service.updateStatus('order',{status:'DELIVERED'},null,observation);
  expect(s.commissions.awardForDeliveredOrder).toHaveBeenCalledTimes(1);
  expect(s.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE orders SET status'),['DELIVERED','order']);
  expect(s.query).toHaveBeenCalledWith(expect.stringContaining('tracking_number=COALESCE'),['6','1','shipment','123']);
 });
 it('a repeated delivery never creates commissions or events again',async()=>{
  const s=setup('DELIVERED','DELIVERED');await s.service.updateStatus('order',{status:'DELIVERED'},null,observation);
  expect(s.commissions.awardForDeliveredOrder).not.toHaveBeenCalled();expect(s.query).toHaveBeenCalledTimes(1);
 });
 it('rejects stale shipment references and canceled orders before any update',async()=>{
  const changed=setup('CREATED','PROCESSING','DIFFERENT');await expect(changed.service.updateStatus('order',{status:'DELIVERED'},null,observation)).rejects.toThrow();expect(changed.query).toHaveBeenCalledTimes(1);
  const cancelled=setup('CREATED','CANCELLED');await expect(cancelled.service.updateStatus('order',{status:'DELIVERED'},null,observation)).rejects.toThrow();expect(cancelled.query).toHaveBeenCalledTimes(1);
 });
 it('return observations record an exception without finalizing customer delivery or commissions',async()=>{
  const s=setup('IN_TRANSIT','SHIPPED');await s.service.updateStatus('order',{status:'FAILED',description:'Aras Kargo İade Olarak Bildirdi'},null,{...observation,direction:'3'});
  expect(s.commissions.awardForDeliveredOrder).not.toHaveBeenCalled();expect(s.query.mock.calls.some(([sql])=>sql.startsWith('UPDATE orders SET'))).toBe(false);
 });
});
