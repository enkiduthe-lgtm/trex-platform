import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
describe('Audited customer notes', () => {
  function setup(query: jest.Mock) {
    const transaction = jest.fn(async work => work({ query }));
    return { transaction, service: new CustomersService({ transaction } as never) };
  }
  it('writes a trimmed note and audit in one transaction without copying private text into audit', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'note' }] }).mockResolvedValue({ rows: [] });
    const s = setup(query);
    await expect(s.service.addNote('customer',' private note ','actor')).resolves.toEqual({ id: 'note' });
    expect(s.transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[1][1]).toEqual(['customer','private note','actor']);
    expect(query.mock.calls[2][1]).toEqual(['actor','customer.note.created','customer','customer']);
  });
  it('rejects empty notes before starting a transaction', async () => {
    const s = setup(jest.fn());
    await expect(s.service.addNote('customer','  ','actor')).rejects.toBeInstanceOf(BadRequestException);
    expect(s.transaction).not.toHaveBeenCalled();
  });
  it('rejects missing customers before adding note or audit', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 0 });
    await expect(setup(query).service.addNote('missing','note','actor')).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('propagates audit failure to roll back the note', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'note' }] }).mockRejectedValueOnce(new Error('audit failed'));
    await expect(setup(query).service.addNote('customer','note','actor')).rejects.toThrow('audit failed');
  });
});
