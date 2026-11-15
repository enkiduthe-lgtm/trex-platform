import { DealerPortalController } from './dealer-portal.controller';

describe('DealerPortalController', () => {
  const request = { user: { id: 'dealer-user', email: 'dealer@example.com', role: 'DEALER', sessionId: 'session' } } as never;

  it('does not read product or address details for an order the dealer does not own', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.orderDetail('other-order', request)).rejects.toThrow('Sipariş Bulunamadı');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['dealer-user', 'other-order']);
    expect(query.mock.calls[0][0]).toContain('origin.dealer_id=portal.dealer_id::text');
  });

  it('returns the saved order prices and delivery address for an owned order', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'order' }] })
      .mockResolvedValueOnce({ rows: [{ unit_amount: '20.00', quantity: 2 }] })
      .mockResolvedValueOnce({ rows: [{ recipient_name: 'Recipient' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'return' }] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.orderDetail('order', request)).resolves.toEqual({ id: 'order', items: [{ unit_amount: '20.00', quantity: 2 }], address: { recipient_name: 'Recipient' }, returns: [{ id: 'return' }] });
    expect(query.mock.calls[1][1]).toEqual(['order']);
    expect(query.mock.calls[2][1]).toEqual(['order']);
    expect(query.mock.calls[3][1]).toEqual(['order']);
  });

  it('calculates balances over all eligible movements separately per currency', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ dealer_id: 'dealer' }] })
      .mockResolvedValueOnce({ rows: [{ currency: 'TRY' }] })
      .mockResolvedValueOnce({ rows: [{ available: '123.45', eligible: '100.00' }] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.commissionBalances(request)).resolves.toEqual([{ currency: 'TRY', amount: '123.45' }]);
    const sql = query.mock.calls[2][0] as string;
    expect(query.mock.calls[0][0]).toContain('WHERE user_id=$1');
    expect(sql).toContain("e.status IN ('CONFIRMED','AVAILABLE')");
    expect(sql).toContain('dealer_prim_deductions');
    expect(sql).toContain('dealer_commission_spends');
    expect(sql).not.toContain('LIMIT');
    expect(query.mock.calls[0][1]).toEqual(['dealer-user']);
    expect(query.mock.calls[2][1]).toEqual(['dealer','TRY',null]);
  });

  it('uses an ownership existence check so repeated audit entries cannot duplicate orders', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await controller.listOrders(request);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE o.archived_at IS NULL AND EXISTS'), ['dealer-user']);
  });

  it('restricts ledger movements to the authenticated dealer account', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'ledger' }] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.ledger(request)).resolves.toEqual([{ id: 'ledger' }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE dua.user_id=$1'), ['dealer-user']);
  });

  it('restricts shipment records to the authenticated dealer account', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.shipments(request)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('origin.dealer_id=portal.dealer_id::text'), ['dealer-user']);
    expect(query.mock.calls[0][0]).toContain('al.entity_id=o.id::text');
  });

  it('allows an active dealer to accept the agreement without bank details', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ dealer_id: 'dealer' }] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.acceptAgreement(request)).resolves.toEqual({ accepted: true });
    expect(query.mock.calls[0][0]).not.toContain('dealer_bank_accounts');
    expect(query.mock.calls[0][0]).toContain("d.status='ACTIVE'");
    expect(query.mock.calls[0][1]).toEqual(['dealer-user']);
  });

  it('creates a dealer order without requiring bank details and preserves dealer pricing scope', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ dealer_id: 'dealer' }] });
    const create = jest.fn().mockResolvedValue({ id: 'order' });
    const controller = new DealerPortalController({ query } as never, {} as never, { create } as never);
    await expect(controller.createOrder({ salesChannel: 'RETAIL', customerId: 'other' } as never, 'key', request)).resolves.toEqual({ id: 'order' });
    expect(query.mock.calls[0][0]).not.toContain('dealer_bank_accounts');
    expect(query.mock.calls[0][0]).toContain("d.status='ACTIVE' AND dua.agreement_accepted_at IS NOT NULL");
    expect(query.mock.calls[0][1]).toEqual(['dealer-user']);
    expect(create).toHaveBeenCalledWith({ salesChannel: 'DEALER_PORTAL', customerId: undefined, priceChangeReason: 'Bayi portalı fiyatı' }, 'key', (request as any).user, 'dealer');
  });

  it('does not create an order when the active account or accepted agreement is missing', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const create = jest.fn();
    const controller = new DealerPortalController({ query } as never, {} as never, { create } as never);
    await expect(controller.createOrder({} as never, 'key', request)).rejects.toThrow('Bayi hesabı bulunamadı');
    expect(create).not.toHaveBeenCalled();
    await expect(controller.acceptAgreement(request)).rejects.toThrow('Aktif Bir Bayi Hesabı');
  });

  it('counts orders for the current dealer account and uses wallet rules for its balance', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'dealer', order_count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ available: '12.34' }] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.summary(request)).resolves.toEqual({ order_count: '2', available_commission: '12.34' });
    expect(query.mock.calls[0][0]).toContain('origin.dealer_id=portal.dealer_id::text');
    expect(query.mock.calls[1][1]).toEqual(['dealer', 'TRY', null]);
    expect(query.mock.calls[0][0]).toContain("'order.dealer.created','order.admin.created'");
  });

  it('returns only the current dealer commission movements', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'entry', order_number: 'TRX-1' }] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.commissions(request)).resolves.toEqual([{ id: 'entry', order_number: 'TRX-1' }]);
    expect(query.mock.calls[0][0]).toContain('dealer_user_accounts dua JOIN commission_entries e ON e.dealer_id=dua.dealer_id');
    expect(query.mock.calls[0][1]).toEqual(['dealer-user']);
  });
});
