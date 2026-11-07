import { CommissionsService } from './commissions.service';
import { StaffChannelService } from './staff-channel.service';

describe('Delivered sales channel commissions', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([
    ['INSTAGRAM', 'RETAIL'], ['PUBLIC_WEB', 'RETAIL'],
    ['MARKETPLACE', 'RETAIL'], ['RETAIL', 'RETAIL'],
    ['ADMIN_ORDER', 'RETAIL'], ['WHOLESALE', 'WHOLESALE'],
    ['DEALER_PORTAL', 'DEALER'],
  ])('%s uses the %s rate group on delivery', async (channel, group) => {
    const client = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ sales_channel: channel }] }) };
    const award = jest.spyOn(StaffChannelService.prototype, 'award').mockResolvedValue({ handled: true, created: 2 });
    const service = new CommissionsService({} as never);
    await expect(service.awardForDeliveredOrder('order', null, client as never)).resolves.toEqual({ created: 2 });
    expect(award).toHaveBeenCalledWith(client, 'order', group);
  });
});
