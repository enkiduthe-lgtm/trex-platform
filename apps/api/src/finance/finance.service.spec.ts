import { FinanceService } from './finance.service';

describe('FinanceService marketplace settlements', () => {
  it('rejects deductions that exceed the marketplace gross sale before any write', async () => {
    const transaction = jest.fn();
    const service = new FinanceService({ transaction } as never);

    await expect(service.createMarketplaceSettlement({ accountId: '00000000-0000-4000-8000-000000000001', marketplaceName: 'Trendyol', grossSalesAmount: 100, commissionAmount: 101 }, { id: '00000000-0000-4000-8000-000000000002' } as never)).rejects.toThrow('Kesintiler brüt satış tutarından yüksek olamaz');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('keeps an order awaiting payment when an approved collection only covers part of it', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'collection-1', amount: '40.00' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'order-1', status: 'PENDING_PAYMENT', total_amount: '100.00', checkout_id: 'checkout-1' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0.00' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const service = new FinanceService({ transaction: async (work: (client: unknown) => Promise<unknown>) => work({ query }) } as never);

    await expect(service.approveCollection('collection-1', { orderId: 'order-1' }, { id: 'user-1' } as never)).resolves.toEqual({ collectionId: 'collection-1', orderId: 'order-1', paymentStatus: 'PAID', orderStatus: 'PENDING_PAYMENT', collectedTotal: 40, outstandingAmount: 60 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE orders SET status='PAID'"))).toBe(false);
  });

  it('approves a fully covered order and starts a picking session once', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'collection-1', amount: '100.00' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'order-1', status: 'PENDING_PAYMENT', total_amount: '100.00', checkout_id: 'checkout-1' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0.00' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [{ warehouse_id: 'warehouse-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'pick-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'order-item-1', quantity: 2 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const service = new FinanceService({ transaction: async (work: (client: unknown) => Promise<unknown>) => work({ query }) } as never);

    await expect(service.approveCollection('collection-1', { orderId: 'order-1' }, { id: 'user-1' } as never)).resolves.toMatchObject({ orderStatus: 'PAID', collectedTotal: 100, outstandingAmount: 0 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO picking_sessions'))).toBe(true);
  });
});
