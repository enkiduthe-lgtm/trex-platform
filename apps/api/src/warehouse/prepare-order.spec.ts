import { WarehouseService } from './warehouse.service';

describe('One-click order preparation', () => {
  function setup(status = 'PAID', existing: unknown = undefined, reservedQuantity = 2) {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ status, checkout_id: 'checkout' }] })
      .mockResolvedValueOnce({ rows: existing ? [existing] : [] })
      .mockResolvedValueOnce({ rows: [{ warehouse_id: 'warehouse', product_id: 'product', quantity: reservedQuantity }] })
      .mockResolvedValueOnce({ rows: [{ id: 'item', product_id: 'product', quantity: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'pick' }] }).mockResolvedValue({ rows: [] });
    return { query, service: new WarehouseService({ transaction: async (work: (client: unknown) => unknown) => work({ query }) } as never) };
  }
  it('completes preparation and opens packing without consuming inventory', async () => {
    const { query, service } = setup();
    await expect(service.prepareOrder('order', 'user')).resolves.toEqual({ id: 'pick', status: 'COMPLETED', replayed: false });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('expected_quantity,picked_quantity'), ['pick', 'item', 2]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO packing_sessions'), ['pick', 'user']);
    expect(query.mock.calls.some(([sql]) => /UPDATE inventory|UPDATE payments|UPDATE stock_reservations/.test(sql))).toBe(false);
  });
  it.each(['PENDING_PAYMENT', 'CANCELLED', 'SHIPPED', 'DELIVERED'])('rejects %s orders before opening a pick', async status => {
    const { query, service } = setup(status);
    await expect(service.prepareOrder('order', 'user')).rejects.toThrow('Ödemesi Onaylanan');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('does not duplicate already completed preparation', async () => {
    const { query, service } = setup('PAID', { id: 'pick', status: 'COMPLETED' });
    await expect(service.prepareOrder('order', 'user')).resolves.toMatchObject({ id: 'pick', replayed: true });
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rejects incomplete reservations before writing preparation', async () => {
    const { query, service } = setup('PAID', undefined, 1);
    await expect(service.prepareOrder('order', 'user')).rejects.toThrow('Stok Rezervasyonu');
    expect(query).toHaveBeenCalledTimes(4);
  });
});
