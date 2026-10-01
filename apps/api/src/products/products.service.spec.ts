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
  it('imports a list atomically and records every imported product', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 'p1', sku: 'TREX-01' }] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'p2', sku: 'TREX-02' }] }).mockResolvedValueOnce({ rows: [] }) };
    const transaction = jest.fn(async (work: (value: typeof client) => unknown) => work(client));
    const service = new ProductsService({ transaction } as never);
    await expect(service.importMany([{ sku: 'TREX-01', slug: 'trex-cay', name: 'Trex Çay' }, { sku: 'TREX-02', slug: 'trex-dogal', name: 'Trex Doğal' }], actor)).resolves.toMatchObject({ imported: 2 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledTimes(4);
  });
});
