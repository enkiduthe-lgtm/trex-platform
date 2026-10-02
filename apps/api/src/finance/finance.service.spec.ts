import { FinanceService } from './finance.service';

describe('FinanceService marketplace settlements', () => {
  it('rejects deductions that exceed the marketplace gross sale before any write', async () => {
    const transaction = jest.fn();
    const service = new FinanceService({ transaction } as never);

    await expect(service.createMarketplaceSettlement({ accountId: '00000000-0000-4000-8000-000000000001', marketplaceName: 'Trendyol', grossSalesAmount: 100, commissionAmount: 101 }, { id: '00000000-0000-4000-8000-000000000002' } as never)).rejects.toThrow('Kesintiler brüt satış tutarından yüksek olamaz');
    expect(transaction).not.toHaveBeenCalled();
  });
});
