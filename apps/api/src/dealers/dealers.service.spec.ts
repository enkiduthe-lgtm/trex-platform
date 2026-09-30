import { ConflictException } from '@nestjs/common';
import { DealersService } from './dealers.service';
describe('DealersService', () => {
  it('blocks a dealer from becoming its own parent before querying the database', async () => {
    const service = new DealersService({ query: jest.fn() } as never);
    await expect(service.setParent('same', 'same', { id: 'actor', email: 'a@trextea.tr', role: 'ADMIN', sessionId: 'session' })).rejects.toBeInstanceOf(ConflictException);
  });
});
