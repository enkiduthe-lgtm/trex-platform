import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  it('rejects an unknown sales channel before querying PostgreSQL', async () => {
    const query = jest.fn();
    const service = new OrdersService({ query } as never);

    await expect(service.list('not-a-channel')).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('normalizes valid sales channel filters', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const service = new OrdersService({ query } as never);

    await expect(service.list('marketplace')).resolves.toEqual([]);
    expect(query.mock.calls[0][1]).toEqual(['MARKETPLACE']);
  });
});
