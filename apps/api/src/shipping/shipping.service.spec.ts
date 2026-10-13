import { ShippingService } from './shipping.service';
describe('ShippingService', () => {
  it('returns an existing created shipment without calling the provider again', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'shipment', status: 'CREATED', tracking_number: 'TRX1' }] }) };
    const provider = { createShipment: jest.fn() };
    const service = new ShippingService(db as never, provider as never, provider as never);
    await expect(service.create('order')).resolves.toEqual({ shipmentId: 'shipment', trackingNumber: 'TRX1', replayed: true });
    expect(provider.createShipment).not.toHaveBeenCalled();
  });

  it('lists only packed orders without an existing shipment in the shipment queue', async () => {
    const db={query:jest.fn().mockResolvedValue({rows:[{order_id:'order',order_number:'2026-0001'}]})};
    const service=new ShippingService(db as never,{} as never,{} as never);
    await expect(service.readyToShip()).resolves.toEqual([{order_id:'order',order_number:'2026-0001'}]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("o.status='PROCESSING'"));
  });
  it('records a manual status transition as an event and audit entry',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rows:[{id:'shipment',status:'CREATED',contact_email:'buyer@example.com',order_number:'2026-1'}]}).mockResolvedValue({rows:[]});
    const notifications={recordOrderStatus:jest.fn()};
    const service=new ShippingService({transaction:async(work:(client:unknown)=>unknown)=>work({query})} as never,{} as never,{} as never,notifications as never);
    await expect(service.updateStatus('order',{status:'IN_TRANSIT'} as never,'actor')).resolves.toEqual({id:'shipment',status:'IN_TRANSIT'});
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'),['order']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('shipment_events'),expect.any(Array));
    expect(notifications.recordOrderStatus).toHaveBeenCalledWith('buyer@example.com','2026-1','IN_TRANSIT');
  });
});
