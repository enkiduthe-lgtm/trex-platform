import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';

describe('Customer tags', () => {
  function setup(query: jest.Mock) {
    const transaction = jest.fn(async work => work({ query }));
    return { transaction, service: new CustomersService({ query, transaction } as never) };
  }

  it('rejects an empty tag before opening a transaction', async () => {
    const query = jest.fn();
    const { service, transaction } = setup(query);
    await expect(service.createTag({ name: '   ' }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('writes the tag and its audit event together', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'tag', name: 'VIP', color: '#7c3aed' }] })
      .mockResolvedValueOnce({ rows: [] });
    const { service } = setup(query);
    await expect(service.createTag({ name: ' VIP ' }, 'actor')).resolves.toEqual({ id: 'tag', name: 'VIP', color: '#7c3aed' });
    expect(query.mock.calls[0][1]).toEqual(['VIP', '#7c3aed']);
    expect(query.mock.calls[1][1]).toEqual(['actor', 'customer.tag.created', 'customer_tag', 'tag', JSON.stringify({ name: 'VIP' })]);
  });

  it('converts duplicate tag names into a useful conflict', async () => {
    const duplicate = Object.assign(new Error('duplicate'), { code: '23505' });
    const { service } = setup(jest.fn().mockRejectedValue(duplicate));
    await expect(service.createTag({ name: 'VIP' }, 'actor')).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not assign a tag to a missing customer', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const { service } = setup(query);
    await expect(service.assignTag('missing', 'tag', 'actor')).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
