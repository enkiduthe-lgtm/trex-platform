import { ConflictException } from '@nestjs/common';
import { CatalogService } from './catalog.service';

describe('Catalog category tree safety', () => {
  it('rejects moving a category underneath one of its descendants', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] });
    const service = new CatalogService({ query } as never);
    await expect(service.update('categories', 'parent', { name: 'Parent', slug: 'parent', parentId: 'child' }, { id: 'actor' } as never)).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('keeps an ordinary category move available', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'category' }] }).mockResolvedValueOnce({ rows: [] });
    const service = new CatalogService({ query } as never);
    await expect(service.update('categories', 'category', { name: 'Category', slug: 'category', parentId: 'parent' }, { id: 'actor' } as never)).resolves.toEqual({ id: 'category' });
  });
});
