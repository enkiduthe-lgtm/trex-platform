import { NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
describe('Order detail',()=>{
  it('returns guest contact, address snapshots and persisted payment status',async()=>{
    const order={id:'order',customer_email:'guest@example.com',contact_name:'Guest'};
    const db={query:jest.fn().mockResolvedValueOnce({rows:[order]}).mockResolvedValueOnce({rows:[{recipient_name:'Guest'}]}).mockResolvedValueOnce({rows:[{product_name:'Tea',unit_amount:'759.99'}]}).mockResolvedValueOnce({rows:[{provider:'PAYTR',status:'SUCCEEDED'}]})};
    const result=await new OrdersService(db as never).detail('order');
    expect(result).toMatchObject({...order,address:{recipient_name:'Guest'},items:[{unit_amount:'759.99'}],payments:[{status:'SUCCEEDED'}]});
    expect(db.query.mock.calls.every(call=>call[1][0]==='order')).toBe(true);
    expect(db.query.mock.calls[0][0]).toContain('COALESCE(c.email,cs.contact_email)');
  });
  it('rejects an unknown order before reading its data',async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[]})};
    await expect(new OrdersService(db as never).detail('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
