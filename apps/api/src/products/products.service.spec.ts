import { ProductsService } from './products.service';
describe('ProductsService', () => {
  const actor = { id: 'f1ef9cf6-9ee6-453d-a15e-25e9c0573b6c', email: 'admin@trextea.tr', role: 'ADMIN' as const, sessionId: 'x' };
  it('creates a draft product and writes an audit record', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'p1', sku: 'TREX-01', status: 'DRAFT' }] }).mockResolvedValueOnce({ rows: [] });
    const service = new ProductsService({ query } as never);
    await expect(service.create({ sku: 'TREX-01', slug: 'trex-cay', name: 'Trex Çay' }, actor)).resolves.toMatchObject({ id: 'p1', status: 'DRAFT' });
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('never exposes drafts on the public list', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const service = new ProductsService({ query } as never);
    await expect(service.listPublic()).resolves.toEqual([]);
    expect(query.mock.calls[0][0]).toContain("status='ACTIVE'");
  });
});
