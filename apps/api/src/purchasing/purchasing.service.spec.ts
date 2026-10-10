import { ConflictException } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';

describe('PurchasingService safeguards',()=>{
  it('rejects duplicate product lines before opening a purchase-order transaction',async()=>{
    const transaction=jest.fn(); const service=new PurchasingService({transaction} as never);
    await expect(service.createOrder({items:[{productId:'same',quantity:1,unitCost:1},{productId:'same',quantity:2,unitCost:2}]} as never,'actor')).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects receiving more than the outstanding quantity while the purchase line is locked',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rows:[{id:'line',product_id:'product',ordered_quantity:3,received_quantity:2,unit_cost:'10',supplier_id:'supplier',warehouse_id:'warehouse',status:'ORDERED',currency:'TRY'}]});
    const service=new PurchasingService({transaction:async(work:(client:unknown)=>unknown)=>work({query})} as never);
    await expect(service.receive('order',{itemId:'line',quantity:2,lotCode:'LOT'} as never,'actor')).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
  });
});
