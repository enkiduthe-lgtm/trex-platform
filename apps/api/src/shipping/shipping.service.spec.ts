import { ShippingService } from './shipping.service';
describe('ShippingService', () => {
  it('returns an existing created shipment without calling the provider again', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'shipment', status: 'CREATED', tracking_number: 'TRX1' }] }) };
    const provider = { createShipment: jest.fn() };
    const service = new ShippingService(db as never, provider as never);
    await expect(service.create('order')).resolves.toEqual({ shipmentId: 'shipment', trackingNumber: 'TRX1', replayed: true });
    expect(provider.createShipment).not.toHaveBeenCalled();
  });
});
