import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
describe('ProductsService', () => {
  const actor = { id: 'f1ef9cf6-9ee6-453d-a15e-25e9c0573b6c', email: 'admin@trextea.tr', role: 'ADMIN' as const, sessionId: 'x' };
  it('creates a draft product and writes an audit record', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'p1', sku: 'TREX-01', status: 'DRAFT' }] }).mockResolvedValueOnce({ rows: [] });
    const transaction = jest.fn(async work => work({ query }));
    const service = new ProductsService({ transaction } as never);
    await expect(service.create({ sku: 'TREX-01', slug: 'trex-cay', name: 'Trex Çay' }, actor)).resolves.toMatchObject({ id: 'p1', status: 'DRAFT' });
    expect(query).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it('never exposes drafts on the public list', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const service = new ProductsService({ query } as never);
    await expect(service.listPublic()).resolves.toEqual([]);
    expect(query.mock.calls[0][0]).toContain("status='ACTIVE'");
  });
  function transactional(query: jest.Mock) {
    return new ProductsService({ transaction: async (work: (client: unknown) => unknown) => work({ query }) } as never);
  }
  it('does not report product creation success if auditing fails', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'p1' }] }).mockRejectedValueOnce(new Error('audit failed'));
    await expect(transactional(query).create({ sku: 'sku', slug: 'tea', name: 'Tea' }, actor)).rejects.toThrow('audit failed');
  });
  it('updates and audits within the same transaction', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'p1', version: 2 }] }).mockResolvedValue({ rows: [] });
    await expect(transactional(query).update('p1', { version: 1, name: 'New Tea' }, actor)).resolves.toMatchObject({ version: 2 });
    expect(query.mock.calls[1][1]).toEqual([actor.id, 'product.updated', 'product', 'p1']);
    expect(query.mock.calls[0][0]).toContain('version=$9');
  });
  it.each([0, 1])('distinguishes missing products from stale versions (%s)', async rowCount => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowCount });
    await expect(transactional(query).update('p1', { version: 1 }, actor)).rejects.toBeInstanceOf(rowCount ? ConflictException : NotFoundException);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('returns a conflict for duplicate slugs on update', async () => {
    const query = jest.fn().mockRejectedValue({ code: '23505' });
    await expect(transactional(query).update('p1', { version: 1, slug: 'duplicate' }, actor)).rejects.toBeInstanceOf(ConflictException);
  });
  it('fails the update transaction if audit fails', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'p1' }] }).mockRejectedValueOnce(new Error('audit failed'));
    await expect(transactional(query).update('p1', { version: 1 }, actor)).rejects.toThrow('audit failed');
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
