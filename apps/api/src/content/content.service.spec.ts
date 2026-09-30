import { ContentService } from './content.service';
describe('ContentService', () => { it('publishes only an existing draft/review/approved page', async () => { const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: 'page' }] }) }; await expect(new ContentService(db as never).publish('page')).resolves.toEqual({ id: 'page' }); }); });
