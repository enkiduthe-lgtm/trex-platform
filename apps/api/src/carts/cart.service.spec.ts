import { CartService } from './cart.service';
describe('CartService', () => {
  it('uses server-side price resolution to calculate totals', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [{ product_id: 'p', quantity: 2, slug: 'trex', name: 'Trex' }] }) };
    const pricing = { resolve: jest.fn().mockResolvedValue({ amount: '25.50', currency: 'TRY' }) };
    const service = new CartService(db as never, pricing as never);
    await expect(service.view('cart','guest-key')).resolves.toMatchObject({ total: '51.00', currency: 'TRY' });
  });
});
