import { dealerMarginAmount } from './dealer-margin';
import { CommissionsService } from './commissions.service';
describe('Dealer Margin Commission', () => {
  it('earns the entire markup for each unit', () => expect(dealerMarginAmount('500.00','650.00',2)).toBe('300.00'));
  it('does not earn commission at the base price', () => expect(dealerMarginAmount('500.00','500.00',3)).toBe('0.00'));
  it('rejects a price below the assigned level', () => expect(()=>dealerMarginAmount('500.00','499.99',1)).toThrow());
  it('calculates cents exactly', () => expect(dealerMarginAmount('0.10','0.30',3)).toBe('0.60'));
  it('uses the saved base price instead of current price rules', async () => {
    const query=jest.fn().mockResolvedValueOnce({rows:[{metadata:{commissionModel:'DEALER_MARGIN_V1',dealerId:'d',prices:[{productId:'p',originalAmount:'500.00'}]}}]});
    const tx=jest.fn().mockResolvedValueOnce({rows:[{unit_amount:'650.00',quantity:2,currency:'TRY',status:'DELIVERED'}]}).mockResolvedValueOnce({rows:[{id:'earned',amount:'300.00'}]});
    const service=new CommissionsService({query,transaction:async(work:any)=>work({query:tx})} as never);
    await expect(service.confirmForOrderItem({dealerId:'d',orderId:'o',orderItemId:'i',productId:'p',quantity:2})).resolves.toEqual({id:'earned',amount:'300.00'});
    expect(tx.mock.calls[1][1]).toEqual(['d','o','i','300.00','TRY']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(tx.mock.calls[1][0]).toContain('ON CONFLICT DO NOTHING');
  });
});
