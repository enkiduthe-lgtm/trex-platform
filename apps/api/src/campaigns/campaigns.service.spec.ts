import { CampaignsService } from './campaigns.service';

describe('CampaignsService', () => {
  it('rejects a percentage above 100 without querying the database', async () => {
    const db = { query: jest.fn() }; const service = new CampaignsService(db as never);
    await expect(service.createCoupon('campaign', { code: 'TREX', discountType: 'PERCENT', discountValue: 101 },'user')).rejects.toThrow('cannot exceed 100');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('rejects an invalid campaign time window', async () => {
    const service = new CampaignsService({ query: jest.fn() } as never);
    await expect(service.create('X', 'user', '2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z')).rejects.toThrow('end must be after');
  });
  it('caps a fixed coupon discount at the cart subtotal', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'coupon', discount_type: 'FIXED_TRY', discount_value: '100.00', usage_limit: null, used_count: 0 }] }) };
    const service = new CampaignsService(db as never);
    await expect(service.previewCoupon('trex', 40)).resolves.toMatchObject({ discount: '40.00', total: '0.00', currency: 'TRY' });
  });
});
