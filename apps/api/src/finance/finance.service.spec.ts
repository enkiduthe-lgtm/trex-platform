import { FinanceService } from './finance.service';

describe('FinanceService marketplace settlements', () => {
  it.each(['EUR','USD'])('rejects %s collection against TRY order without writes',async currency=>{
    const query=jest.fn().mockResolvedValueOnce({rowCount:1,rows:[{id:'collection',amount:'100.00',currency}]}).mockResolvedValueOnce({rowCount:1,rows:[{id:'order',status:'PENDING_PAYMENT',total_amount:'100.00',currency:'TRY'}]});
    const service=new FinanceService({transaction:async(work:any)=>work({query})} as never);
    await expect(service.approveCollection('collection',{orderId:'order'},{} as never)).rejects.toThrow('aynı para biriminde');
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rejects cancelled order collection',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rowCount:1,rows:[{id:'collection',amount:'100.00',currency:'TRY'}]}).mockResolvedValueOnce({rowCount:1,rows:[{id:'order',status:'CANCELLED',currency:'TRY'}]});
    await expect(new FinanceService({transaction:async(work:any)=>work({query})} as never).approveCollection('collection',{orderId:'order'},{} as never)).rejects.toThrow('İptal edilmiş');
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rejects a transfer between different currencies before writes',async()=>{
    const query=jest.fn().mockResolvedValue({rows:[{id:'from',currency:'EUR'},{id:'to',currency:'TRY'}]});
    await expect(new FinanceService({transaction:async(work:any)=>work({query})} as never).createTransfer({fromAccountId:'from',toAccountId:'to',amount:100,description:'Test'},{} as never)).rejects.toThrow('aynı para biriminde');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it.each(['EUR','USD'])('accepts partial collection in the matching %s account',async currency=>{
    const query=jest.fn().mockResolvedValue({rowCount:1,rows:[]})
      .mockResolvedValueOnce({rowCount:1,rows:[{id:'collection',amount:'20.25',currency}]})
      .mockResolvedValueOnce({rowCount:1,rows:[{id:'order',status:'PENDING_PAYMENT',total_amount:'40.50',currency,checkout_id:'checkout'}]})
      .mockResolvedValueOnce({rows:[{total:'0.00'}]});
    await expect(new FinanceService({transaction:async(work:any)=>work({query})} as never).approveCollection('collection',{orderId:'order'},{} as never)).resolves.toMatchObject({collectedTotal:20.25,outstandingAmount:20.25,orderStatus:'PENDING_PAYMENT'});
  });
  it('marks collected COD payment paid without changing delivery status or creating another pick',async()=>{
    const query=jest.fn().mockResolvedValue({rowCount:1,rows:[]})
      .mockResolvedValueOnce({rowCount:1,rows:[{id:'collection',amount:'100.00',currency:'TRY'}]})
      .mockResolvedValueOnce({rowCount:1,rows:[{id:'order',status:'DELIVERED',total_amount:'100.00',checkout_id:'checkout',currency:'TRY'}]})
      .mockResolvedValueOnce({rows:[{total:'0.00'}]});
    const service=new FinanceService({transaction:async(work:any)=>work({query})} as never);
    await expect(service.approveCollection('collection',{orderId:'order'},{id:'user'} as never)).resolves.toMatchObject({orderStatus:'DELIVERED',outstandingAmount:0});
    expect(query.mock.calls.some(([sql])=>sql.includes("provider IN ('cash_on_delivery_card','cash_on_delivery_cash')"))).toBe(true);
    expect(query.mock.calls.some(([sql])=>sql.includes('UPDATE orders')||sql.includes('INSERT INTO picking_sessions'))).toBe(false);
  });
  it('rejects deductions that exceed the marketplace gross sale before any write', async () => {
    const transaction = jest.fn();
    const service = new FinanceService({ transaction } as never);

    await expect(service.createMarketplaceSettlement({ accountId: '00000000-0000-4000-8000-000000000001', marketplaceName: 'Trendyol', grossSalesAmount: 100, commissionAmount: 101 }, { id: '00000000-0000-4000-8000-000000000002' } as never)).rejects.toThrow('Kesintiler brüt satış tutarından yüksek olamaz');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('keeps an order awaiting payment when an approved collection only covers part of it', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'collection-1', amount: '40.00', currency:'TRY' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'order-1', status: 'PENDING_PAYMENT', total_amount: '100.00', checkout_id: 'checkout-1', currency:'TRY' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0.00' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const service = new FinanceService({ transaction: async (work: (client: unknown) => Promise<unknown>) => work({ query }) } as never);

    await expect(service.approveCollection('collection-1', { orderId: 'order-1' }, { id: 'user-1' } as never)).resolves.toEqual({ collectionId: 'collection-1', orderId: 'order-1', paymentStatus: 'PAID', orderStatus: 'PENDING_PAYMENT', collectedTotal: 40, outstandingAmount: 60 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE orders SET status='PAID'"))).toBe(false);
  });

  it('approves a fully covered order and starts a picking session once', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'collection-1', amount: '100.00', currency:'TRY' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'order-1', status: 'PENDING_PAYMENT', total_amount: '100.00', checkout_id: 'checkout-1', currency:'TRY' }] })
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
